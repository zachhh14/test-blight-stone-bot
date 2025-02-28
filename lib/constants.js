const SERVICES = {
    Spies: [
        { name: 'Screenshot', price: 20, time: '24-48 hours' },
        { name: 'Video', price: 0, time: '24-48 hours' },
        { name: 'BM Spy', price: 155, time: '24-48 hours' },
    ],
    Unbans: [
        { name: 'Ad Account', price: 800, time: '3-7 days' },
        { name: 'Profile', price: 1500, time: '3-7 days' },
        { name: 'Page', price: 1000, time: '3-7 days' },
        { name: 'BM', price: 2000, time: '3-7 days' },
        { name: 'DNR Ad Accounts', price: 2000, time: '3-7 days' },
    ],
    'Ad Approvals': [
        { name: 'Exempt tag', price: 1350, time: '24-48 hours' },
        { name: 'Per Ad', price: 30, time: '24-48 hours' },
    ],
    Bans: [
        { name: 'FB Page Ban', price: 800, time: '3-7 days' },
        { name: 'IG Ban', price: 3000, time: '3-7 days' },
    ],
    'Account Recovery': [
        { name: 'Facebook 2FA', price: 2500 },
        { name: 'Facebook Hacked', price: 3500 },
        { name: 'Instagram', price: 3500 },
    ],
}

const SERVICE_ACCOUNT_ID = [
    'service_Ad Account',
    'service_DNR Ad Accounts',
    'service_Exempt tag',
]

const SPECIAL_COMMANDS = ['/start', '/services']

const SERVICE_PAGE = ['service_Page', 'service_FB Page Ban']

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const NOTION_TOKEN = process.env.NOTION_TOKEN
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID
const ZCP_SECRET_KEY = process.env.ZCP_SECRET_KEY
const ZCP_TOKEN = process.env.ZCP_TOKEN

module.exports = {
    SERVICES,
    SERVICE_ACCOUNT_ID,
    SPECIAL_COMMANDS,
    SERVICE_PAGE,
    TELEGRAM_TOKEN,
    NOTION_TOKEN,
    NOTION_DATABASE_ID,
    ZCP_SECRET_KEY,
    ZCP_TOKEN,
}
