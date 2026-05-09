"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/whatsapp/ui/dialog";
import { ScrollArea } from "@/components/whatsapp/ui/scroll-area";

interface Step {
  title: string;
  instructions: (string | { text: string; href: string })[];
}

interface Guide {
  title: string;
  description: string;
  steps: Step[];
  color: string;
}

const metaSteps: Step[] = [
  {
    title: "Create a Meta App",
    instructions: [
      { text: "Go to the Meta for Developers portal and sign in.", href: "https://developers.facebook.com/" },
      "Click My Apps → Create App.",
      "Select Other as the use case, then Business as the app type.",
      "Enter an App Name and your contact email.",
      "Select your Meta Business Account and click Create app.",
    ],
  },
  {
    title: "Add WhatsApp to your App",
    instructions: [
      "On the App Dashboard, find the WhatsApp product card.",
      "Click Set Up to create a WhatsApp sandbox environment.",
    ],
  },
  {
    title: "Retrieve API Credentials",
    instructions: [
      "Go to WhatsApp → API Setup in the left sidebar.",
      "Copy your Phone Number ID (numeric ID for your sending number).",
      "Copy your WhatsApp Business Account ID (WABA ID).",
      "Note: The token shown here is temporary (24h). You'll create a permanent one in Step 5.",
    ],
  },
  {
    title: "Add a Real Phone Number (Optional)",
    instructions: [
      "On the API Setup page, scroll to \"Add a phone number\" and click Add phone number.",
      "Enter your business display name, timezone, category, and phone number.",
      "Verify the number via SMS or Voice Call.",
      "Note: A number can only be on the WhatsApp Business App OR the Cloud API at one time.",
    ],
  },
  {
    title: "Generate a Permanent System User Token",
    instructions: [
      { text: "Go to Meta Business Settings → System Users.", href: "https://business.facebook.com/settings/system-users" },
      "Click Add to create a System User (e.g. \"CRM API User\") with the Admin role.",
      "Click Add Assets → select your Meta App → toggle Full Control → Save.",
      "Click Generate New Token, select your app.",
      "Check permissions: whatsapp_business_management and whatsapp_business_messaging.",
      "Click Generate Token. Copy and save it immediately — you won't see it again.",
    ],
  },
  {
    title: "Configure Webhooks",
    instructions: [
      "In the App Dashboard, go to WhatsApp → Configuration.",
      "Click Edit under the Webhooks section.",
      "Set Callback URL to: https://your-domain.com/api/webhooks/meta",
      "Set Verify Token to a secret string, then add it to .env.local as META_WEBHOOK_VERIFY_TOKEN.",
      "Click Verify and Save (your app must be deployed and running).",
      "Once verified, click Manage → subscribe to messages.",
    ],
  },
];

const msg91Steps: Step[] = [
  {
    title: "Create an MSG91 Account",
    instructions: [
      { text: "Go to MSG91 and create an account.", href: "https://msg91.com/" },
      "Complete the sign-up and verify your email.",
    ],
  },
  {
    title: "Activate WhatsApp Channel",
    instructions: [
      "Log in to the MSG91 dashboard.",
      { text: "Navigate to WhatsApp under Channels or go directly to the WhatsApp section.", href: "https://control.msg91.com/app/whatsapp" },
      "Follow the prompts to enable WhatsApp for your account and submit your Facebook Business Manager details for approval.",
    ],
  },
  {
    title: "Get Your Auth Key",
    instructions: [
      { text: "Go to your MSG91 dashboard → API Keys / Auth Keys.", href: "https://control.msg91.com/app/api-keys" },
      "Copy your Auth Key.",
      "Paste it in the MSG91 Auth Key field in this Settings panel (per-org), or set MSG91_AUTH_KEY in .env.local as a global fallback.",
    ],
  },
  {
    title: "Add a WhatsApp Number",
    instructions: [
      "In the MSG91 WhatsApp panel, add and verify your business phone number.",
      "Complete the Facebook Business verification process if prompted.",
      "Wait for Meta approval of your WhatsApp Business number.",
    ],
  },
  {
    title: "Configure Webhook URL",
    instructions: [
      "In the MSG91 WhatsApp settings, find the Webhook configuration section.",
      "Set the Inbound Webhook URL to: https://your-domain.com/api/webhooks/msg91",
      "Save the webhook configuration.",
    ],
  },
  {
    title: "Add Number in This App",
    instructions: [
      "Come back to this Settings panel and click \"Fetch from MSG91\" to auto-detect your numbers.",
      "Alternatively, manually add the number with the correct label.",
      "Select \"MSG91 API\" as the provider and save.",
    ],
  },
];

const paymentTemplateSteps: Step[] = [
  {
    title: "Create the Template in MSG91",
    instructions: [
      { text: "Go to the MSG91 WhatsApp Templates section.", href: "https://control.msg91.com/app/whatsapp" },
      "Click Create Template or use the Templates tab in this app.",
      "Create a template with exactly 3 body variables for payment links.",
    ],
  },
  {
    title: "Template Variable Format",
    instructions: [
      "Variable {{1}} = Payment amount (e.g. \"₹500\").",
      "Variable {{2}} = Payment description (e.g. \"Invoice #1234\").",
      "Variable {{3}} = Payment link URL (e.g. \"https://rzp.io/i/abc123\").",
      "Example template body: \"Please pay {{1}} for {{2}}. Click here to pay: {{3}}\"",
    ],
  },
  {
    title: "Wait for Approval",
    instructions: [
      "Submit the template for Meta/WhatsApp approval.",
      "Approval usually takes a few minutes to a few hours.",
      "Once approved, the template status will show as \"APPROVED\" in the Templates tab.",
    ],
  },
  {
    title: "Enter the Template Name Here",
    instructions: [
      "Copy the exact template name (e.g. \"payment_link_v1\") — not the display name.",
      "Paste it into the Payment Template Name field in this settings panel.",
      "This template is used automatically when sending a payment link outside the 24-hour WhatsApp session window.",
    ],
  },
];

const razorpaySteps: Step[] = [
  {
    title: "Create a Razorpay Account",
    instructions: [
      { text: "Go to the Razorpay Dashboard and sign up or log in.", href: "https://dashboard.razorpay.com/" },
      "Complete KYC verification if you haven't already.",
    ],
  },
  {
    title: "Get API Keys",
    instructions: [
      { text: "Go to Settings → API Keys in the Razorpay Dashboard.", href: "https://dashboard.razorpay.com/app/website-app-settings/api-keys" },
      "Click Generate Key to create a new key pair.",
      "Copy the Key ID (starts with \"rzp_live_\" or \"rzp_test_\").",
      "Copy the Key Secret — you will only see it once, so save it immediately.",
    ],
  },
  {
    title: "Configure in This App",
    instructions: [
      "Paste the Razorpay Key ID and Key Secret into the fields below.",
      "These are saved per-organization, so each org can have its own Razorpay account.",
      "Alternatively, set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local as a global fallback.",
    ],
  },
  {
    title: "Configure Razorpay Webhook (Optional)",
    instructions: [
      "In Razorpay Dashboard → Settings → Webhooks, click Add New Webhook.",
      "Set Webhook URL to: https://your-domain.com/api/webhooks/razorpay",
      "Select events: payment_link.paid, payment_link.expired, payment_link.cancelled.",
      "Set the Webhook Secret to your RAZORPAY_KEY_SECRET value.",
      "This enables automatic payment status updates in the app.",
    ],
  },
];

const msg91AuthKeySteps: Step[] = [
  {
    title: "Find Your MSG91 Auth Key",
    instructions: [
      { text: "Log in to the MSG91 Dashboard.", href: "https://control.msg91.com/" },
      { text: "Go to API Keys / Auth Keys section.", href: "https://control.msg91.com/app/api-keys" },
      "Copy the Auth Key shown on the page.",
    ],
  },
  {
    title: "Enter It Here",
    instructions: [
      "Paste your MSG91 Auth Key into the field below.",
      "This key is saved per-organization — each org can use a different MSG91 account.",
      "If left empty, the app falls back to the global MSG91_AUTH_KEY environment variable.",
    ],
  },
  {
    title: "Verify",
    instructions: [
      "After saving, try sending a test message or click \"Fetch from MSG91\" in the WhatsApp Numbers tab.",
      "If the key is invalid, API calls will return authentication errors.",
    ],
  },
];

const guides: Record<string, Guide> = {
  meta: {
    title: "Meta WhatsApp Cloud API Setup",
    description: "Follow these steps to configure your Meta Developer account and generate the credentials needed for the Direct Meta Cloud API provider.",
    steps: metaSteps,
    color: "bg-blue-600",
  },
  msg91: {
    title: "MSG91 WhatsApp API Setup",
    description: "Follow these steps to set up your MSG91 account and configure it for use with this application.",
    steps: msg91Steps,
    color: "bg-purple-600",
  },
  payment_template: {
    title: "Payment Template Setup",
    description: "Set up a WhatsApp message template for sending payment links when the 24-hour session window has expired.",
    steps: paymentTemplateSteps,
    color: "bg-amber-600",
  },
  razorpay: {
    title: "Razorpay Setup",
    description: "Configure Razorpay payment gateway credentials to create and manage payment links via WhatsApp.",
    steps: razorpaySteps,
    color: "bg-blue-700",
  },
  msg91_auth_key: {
    title: "MSG91 Auth Key Setup",
    description: "Configure your organization's MSG91 authentication key for sending WhatsApp messages and accessing MSG91 APIs.",
    steps: msg91AuthKeySteps,
    color: "bg-purple-600",
  },
};

export type GuideKey = keyof typeof guides;

export function SetupGuideDialog({
  guideKey,
  onClose,
}: {
  guideKey: GuideKey | null;
  onClose: () => void;
}) {
  if (!guideKey) return null;

  const guide = guides[guideKey];
  if (!guide) return null;

  return (
    <Dialog open={!!guideKey} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg font-bold text-slate-800">
            {guide.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {guide.description}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="px-6 pb-6 max-h-[65vh]">
          <div className="space-y-5">
            {guide.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded-full ${guide.color} text-white text-xs font-bold flex items-center justify-center mt-0.5`}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-slate-800 mb-1.5">
                    {step.title}
                  </h4>
                  <ul className="space-y-1">
                    {step.instructions.map((instr, j) => (
                      <li
                        key={j}
                        className="text-xs text-slate-600 leading-relaxed flex gap-1.5"
                      >
                        <span className="text-slate-300 mt-px">•</span>
                        <span>
                          {typeof instr === "string" ? (
                            instr
                          ) : (
                            <a
                              href={instr.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
                            >
                              {instr.text}
                            </a>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
