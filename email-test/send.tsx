import { parseArgs } from "util";

import nodemailer from "nodemailer";
import { render } from "react-email";
import z from "zod";

import NotionMagicLinkEmail from "./emails/notion-magic-link";
import PlaidVerifyIdentityEmail from "./emails/plaid-verify-identity";
import StripeWelcomeEmail from "./emails/stripe-welcome";
import VercelInviteUserEmail from "./emails/vercel-invite-user";

const envSchema = z.object({
	host: z.string().default("localhost"),
	port: z.coerce.number().default(1025),
	secure: z.boolean(),
	auth: z.object({
		user: z.string().default("username"),
		pass: z.string().default("password"),
	}),
});

const emailData = {
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
};
type TemplateName = keyof typeof emailData;
const allowedTemplateNames = Object.keys(emailData);

const { values } = parseArgs({
	args: Bun.argv.splice(2),
	options: {
		email: {
			type: "string",
		},
	},
	strict: true,
	allowPositionals: false,
});

if (!values.email) {
	console.error("no template given");
	process.exit(1);
}

if (!allowedTemplateNames.includes(values.email)) {
	console.error(
		`Invalid template given: ${values.email}, allowed: ${allowedTemplateNames.join(", ")}`,
	);
	process.exit(2);
}

const emailTemplate = values.email as TemplateName;
const email = emailData[emailTemplate];

const emailHtml = await render(<email.component {...email.props} />);

const options = {
	from: "you@example.com",
	to: "user@gmail.com",
	subject: "hello world",
	html: emailHtml,
};

const envData = {
	host: process.env.MAILDEBUG_DOMAIN,
	port: process.env.MAILDEBUG_SMTP_PORT,
	secure: false,
	auth: {
		user: process.env.MAILDEBUG_SMTP_USERNAME,
		pass: process.env.MAILDEBUG_SMTP_PASSWORD,
	},
};

const env = envSchema.parse(envData);
const transporter = nodemailer.createTransport(env);

const res = await transporter.sendMail(options);
console.log(res);
