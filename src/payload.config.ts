import { postgresAdapter } from '@payloadcms/db-postgres'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

// Collections
import { Categories } from './collections/Categories'
import { Conversations } from './collections/Conversations'
import { Coupons } from './collections/Coupons'
import { Customers } from './collections/Customers'
import { Media } from './collections/Media'
import { Orders } from './collections/Orders'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Products } from './collections/Products'
import { Reviews } from './collections/Reviews'
import { ShippingClasses } from './collections/ShippingClasses'
import { ShippingZones } from './collections/ShippingZones'
import { SubCategories } from './collections/SubCategories'
import { Subscribers } from './collections/Subscribers'
import { TaxRates } from './collections/TaxRates'
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
    Orders,
    Customers,
    TaxRates,
    ShippingZones,
    ShippingClasses,
    Coupons,
    Reviews,
    // Content
    Pages,
    Posts,
    Media,
    // Communication
    Conversations,
    Subscribers,
    // Admin
    Users,
  ],
  cors: [getServerSideURL()].filter(Boolean),
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
