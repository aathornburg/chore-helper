import { Resend } from "resend";
import type { InvitationMailMessage, InvitationMailer } from "./InvitationMailer.js";

export class ResendInvitationMailer implements InvitationMailer {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string
  ) {
    this.resend = new Resend(apiKey);
  }

  async sendInvitation(message: InvitationMailMessage): Promise<void> {
    const { error } = await this.resend.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: `Join ${message.householdName} on Cleanly`,
        text: `You have been invited to join ${message.householdName} on Cleanly. Accept your invitation: ${message.acceptUrl}`
      },
      { idempotencyKey: `household-invitation/${message.idempotencyKey}` }
    );

    if (error) {
      throw new Error(`Could not send invitation email: ${error.message}`);
    }
  }
}
