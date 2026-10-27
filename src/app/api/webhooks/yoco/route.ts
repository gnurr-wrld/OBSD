import { NextResponse } from "next/server";
import { verifyYocoWebhookSignature } from "@/lib/yoco";
import { markOrderPaidViaYocoWebhookAction } from "@/app/actions/cart";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const webhookId = request.headers.get("webhook-id") || "";
    const webhookTimestamp = request.headers.get("webhook-timestamp") || "";
    const webhookSignature = request.headers.get("webhook-signature") || "";

    const isVerified = verifyYocoWebhookSignature({
      rawBody,
      webhookId,
      webhookTimestamp,
      webhookSignature,
    });

    if (!isVerified) {
      return NextResponse.json(
        { ok: false, error: "Invalid Yoco webhook signature or expired timestamp" },
        { status: 401 }
      );
    }

    const event = JSON.parse(rawBody) as {
      type?: string;
      payload?: {
        id?: string;
        metadata?: {
          orderId?: string;
        };
      };
    };

    if (
      event.type === "payment.succeeded" &&
      event.payload?.metadata?.orderId
    ) {
      await markOrderPaidViaYocoWebhookAction(
        event.payload.metadata.orderId,
        event.payload.id || webhookId
      );
    }

    return NextResponse.json({ ok: true, received: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Webhook processing error" },
      { status: 400 }
    );
  }
}
