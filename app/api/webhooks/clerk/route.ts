import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createServerClient } from '@/lib/supabase';
import { serverTrackSignup } from '@/lib/posthog-server-events';
import { sendEmail } from '@/lib/email';
import { welcomeEmail } from '@/lib/email-templates';

interface ClerkUserEvent {
  data: {
    id: string;
    email_addresses: Array<{
      email_address: string;
      id: string;
    }>;
    first_name: string | null;
    last_name: string | null;
    primary_email_address_id: string;
  };
  type: string;
}

export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  // Get the Svix headers for verification
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    );
  }

  // Get the raw body
  const body = await req.text();

  // Verify the webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let event: ClerkUserEvent;

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkUserEvent;
  } catch {
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  try {
    switch (event.type) {
      case 'user.created': {
        const { id: clerkId, email_addresses, first_name, last_name, primary_email_address_id } = event.data;

        // Find the primary email address
        const primaryEmail = email_addresses.find(
          (e) => e.id === primary_email_address_id
        );
        const email = primaryEmail?.email_address ?? email_addresses[0]?.email_address ?? '';
        const name = [first_name, last_name].filter(Boolean).join(' ') || null;

        // Upsert: if Clerk re-delivers user.created, we ignore the duplicate
        // instead of failing on the clerk_id unique constraint.
        // ignoreDuplicates: true ensures we DON'T overwrite existing balance.
        const { error } = await supabase.from('users').upsert(
          {
            clerk_id: clerkId,
            email,
            name,
            credits_balance: 100, // Free beta — generous credits for testers
          },
          { onConflict: 'clerk_id', ignoreDuplicates: true }
        );

        if (error) {
          console.error('Failed to create user:', error.message);
          return NextResponse.json(
            { error: 'Failed to create user' },
            { status: 500 }
          );
        }

        // Track signup event
        serverTrackSignup(clerkId, 'email'); // Default to email; Clerk doesn't expose SSO provider in webhook

        // Send welcome email (fire-and-forget)
        const welcomeTemplate = welcomeEmail(name);
        sendEmail({ to: email, subject: welcomeTemplate.subject, html: welcomeTemplate.html });

        break;
      }

      case 'user.updated': {
        const { id: clerkId, email_addresses, first_name, last_name, primary_email_address_id } = event.data;

        const primaryEmail = email_addresses.find(
          (e) => e.id === primary_email_address_id
        );
        const email = primaryEmail?.email_address ?? email_addresses[0]?.email_address ?? '';
        const name = [first_name, last_name].filter(Boolean).join(' ') || null;

        const { error } = await supabase
          .from('users')
          .update({ email, name })
          .eq('clerk_id', clerkId);

        if (error) {
          console.error('Failed to update user:', error.message);
          return NextResponse.json(
            { error: 'Failed to update user' },
            { status: 500 }
          );
        }

        break;
      }

      default:
        // Unhandled event type -- acknowledge receipt
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('Clerk webhook error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
