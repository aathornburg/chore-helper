export type InvitationMailMessage = {
  to: string;
  householdName: string;
  acceptUrl: string;
  idempotencyKey: string;
};

export type InvitationMailer = {
  sendInvitation(message: InvitationMailMessage): Promise<void>;
};

export class UnavailableInvitationMailer implements InvitationMailer {
  async sendInvitation(_message: InvitationMailMessage): Promise<void> {
    throw new Error("Invitation email delivery is not configured");
  }
}

export class LocalInvitationMailer implements InvitationMailer {
  async sendInvitation(message: InvitationMailMessage): Promise<void> {
    console.info(`Local invitation for ${message.to}: ${message.acceptUrl}`);
  }
}
