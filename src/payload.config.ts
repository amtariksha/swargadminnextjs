import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

// Collections
import { CartSessions } from './collections/CartSessions'
import { Categories } from './collections/Categories'
import { Conversations } from './collections/Conversations'
import { Coupons } from './collections/Coupons'
import { Customers } from './collections/Customers'
import { FAQs } from './collections/FAQs'
import { Media } from './collections/Media'
import { Orders } from './collections/Orders'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Products } from './collections/Products'
import { Recipes } from './collections/Recipes'
import { Reviews } from './collections/Reviews'
import { ShippingClasses } from './collections/ShippingClasses'
import { ShippingZones } from './collections/ShippingZones'
import { StoreLocations } from './collections/StoreLocations'
import { SubCategories } from './collections/SubCategories'
import { Subscribers } from './collections/Subscribers'
import { Tags } from './collections/Tags'
import { TaxRates } from './collections/TaxRates'
import { TeamMembers } from './collections/TeamMembers'
import { Testimonials } from './collections/Testimonials'
import { Users } from './collections/Users'

// Globals
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { SiteSettings } from './globals/SiteSettings'
import { CommerceSettings } from './globals/CommerceSettings'
import { MarketingSettings } from './globals/MarketingSettings'
import { Navigation } from './globals/Navigation'

// Other
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    components: {
      beforeLogin: ['@/components/BeforeLogin'],
      beforeDashboard: ['@/components/BeforeDashboard'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        { label: 'Mobile', name: 'mobile', width: 375, height: 667 },
        { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
        { label: 'Desktop', name: 'desktop', width: 1440, height: 900 },
      ],
    },
  },
  editor: defaultLexical,
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
      ssl: { rejectUnauthorized: false },
    },
    // Set PAYLOAD_PUSH=true in Vercel to let drizzle-kit push the current
    // collection schema to Postgres on boot. Use as a one-shot to sync
    // missing columns; turn back off once stable.
    push: process.env.PAYLOAD_PUSH === 'true',
  }),
  collections: [
    // Commerce
    Products,
    Categories,
    SubCategories,
    Tags,
    Orders,
    Customers,
    TaxRates,
    ShippingZones,
    ShippingClasses,
    Coupons,
    Reviews,
    CartSessions,
    // Content
    Pages,
    Posts,
    Recipes,
    Media,
    // Marketing / About
    Testimonials,
    TeamMembers,
    StoreLocations,
    FAQs,
    // Communication
    Conversations,
    Subscribers,
    // Admin
    Users,
  ],
  cors: [
    getServerSideURL(),
    'https://new.swargfood.com',
    'https://swargfood.com',
  ].filter(Boolean),
  globals: [
    Header,
    Footer,
    SiteSettings,
    CommerceSettings,
    MarketingSettings,
    Navigation,
  ],
  plugins,
  secret: process.env.PAYLOAD_SECRET || 'default-secret-change-me',
  sharp,
  // Email adapter. Replaces the WP "Gmail SMTP" plugin. When RESEND_API_KEY
  // is unset (local dev / preview), Payload silently falls back to its
  // "console" adapter and prints email bodies to stdout instead of sending.
  // Generate the key at https://resend.com/api-keys and verify the sending
  // domain (DNS records — SPF + DKIM — provided in the Resend dashboard).
  ...(process.env.RESEND_API_KEY
    ? {
        email: resendAdapter({
          apiKey: process.env.RESEND_API_KEY,
          defaultFromAddress: process.env.EMAIL_FROM || 'orders@swargfood.com',
          defaultFromName: process.env.EMAIL_FROM_NAME || 'Swarg Food',
          // Set EMAIL_OVERRIDE_TO=<your-test-inbox> on preview/staging to
          // redirect ALL emails to one inbox instead of real customers.
          ...(process.env.EMAIL_OVERRIDE_TO
            ? { overrideRecipientAddress: process.env.EMAIL_OVERRIDE_TO }
            : {}),
        }),
      }
    : {}),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        if (req.user) return true

        const secret = process.env.CRON_SECRET
        if (!secret) return false

        const authHeader = req.headers.get('authorization')
        return authHeader === `Bearer ${secret}`
      },
    },
    tasks: [],
  },
})
