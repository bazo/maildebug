import nodemailer from "nodemailer";
import { render } from "react-email";
import z from "zod";

import NotionMagicLinkEmail from "./emails/notion-magic-link";
import PlaidVerifyIdentityEmail from "./emails/plaid-verify-identity";
import ResponsiveTestEmail from "./emails/responsive-test";
import StripeWelcomeEmail from "./emails/stripe-welcome";
import VercelInviteUserEmail from "./emails/vercel-invite-user";

export const emailData = {
	notion: {
		component: NotionMagicLinkEmail,
		props: {
			loginCode: "1234",
		},
	},
	plaid: {
		component: PlaidVerifyIdentityEmail,
		props: {
			validationCode: "1234",
		},
	},
	stripe: {
		component: StripeWelcomeEmail,
		props: {},
	},
	vercel: {
		component: VercelInviteUserEmail,
		props: {
			username: "alanturing",
			userImage: "https://react-email-demo.vercel.app/static/vercel-user.png",
			invitedByUsername: "Alan",
			invitedByEmail: "alan.turing@example.com",
			teamName: "Enigma",
			teamImage: "https://react-email-demo.vercel.app/static/vercel-team.png",
			inviteLink: "https://vercel.com/teams/invite/foo",
			inviteFromIp: "204.13.186.218",
			inviteFromLocation: "São Paulo, Brazil",
		},
	},
	responsive: {
		component: ResponsiveTestEmail,
		props: {},
	},
};

export type TemplateName = keyof typeof emailData;
export const allowedTemplateNames = Object.keys(emailData) as TemplateName[];

export function isTemplateName(name: string): name is TemplateName {
	return allowedTemplateNames.includes(name as TemplateName);
}

/** Render a registered template to an HTML string. */
export function renderTemplate(name: TemplateName): Promise<string> {
	const email = emailData[name];
	const Component = email.component as (props: object) => React.ReactElement;
	return render(<Component {...email.props} />);
}

const envSchema = z.object({
	host: z.string().default("localhost"),
	port: z.coerce.number().default(1025),
	secure: z.boolean().default(false),
	auth: z.object({
		user: z.string().default("username"),
		pass: z.string().default("password"),
	}),
});

export type SmtpConfig = z.infer<typeof envSchema>;

/**
 * Build the nodemailer SMTP config from MAILDEBUG_* env vars. Reads the same
 * USERNAME/PASSWORD names the Go server and maildebug.env.example use.
 */
export function smtpConfigFromEnv(): SmtpConfig {
	return envSchema.parse({
		host: process.env.MAILDEBUG_DOMAIN,
		port: process.env.MAILDEBUG_SMTP_PORT,
		secure: false,
		auth: {
			user: process.env.MAILDEBUG_USERNAME,
			pass: process.env.MAILDEBUG_PASSWORD,
		},
	});
}

interface SendEmailOptions {
	config: SmtpConfig;
	from: string;
	to: string;
	subject: string;
	html: string;
}

/** Send one HTML email through a maildebug SMTP server. */
export function sendEmail({ config, from, to, subject, html }: SendEmailOptions) {
	const transporter = nodemailer.createTransport(config);
	return transporter.sendMail({ from, to, subject, html });
}
