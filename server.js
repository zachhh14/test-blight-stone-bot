require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const { Client } = require('@notionhq/client')
const axios = require('axios')

const telegramToken = process.env.TELEGRAM_TOKEN
const notionToken = process.env.NOTION_TOKEN
const ZCP_SECRET_KEY = process.env.ZCP_SECRET_KEY
const ZCP_TOKEN = process.env.ZCP_TOKEN

// change this to webhooks in production
const bot = new TelegramBot(telegramToken, { polling: true })
const notion = new Client({ auth: notionToken })

const {
    SERVICES,
    SPECIAL_COMMANDS,
    SERVICE_ACCOUNT_ID,
    SERVICE_PAGE,
} = require('./lib/contants')

let categorySelected = ''
let serviceSelected = ''
let isBotAskingForInput = false

const temporaryFunction = async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id
    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Yes', callback_data: 'yes' },
                    { text: 'No', callback_data: 'no' },
                ],
            ],
        },
    }

    return await bot.sendMessage(chatId, 'Nagbayad ka na?', options)
}

const createPayment = async (chatId, callbackQueryId) => {
    // Build the payment payload. Removed the webhook property since we're not using webhooks.
    const paymentPayload = {
        amount: 100, // example amount
        currency: 'USDT',
        // URL that ZeroCryptoPay should call after payment is processed
        callback_url: 'https://yourdomain.com/payment/callback',
        // URL to redirect user after successful payment
        success_url: 'https://yourdomain.com/payment/success',
        // URL to redirect user after failed payment
        error_url: 'https://yourdomain.com/payment/error',
        // Additional metadata (e.g., chat id, order id, etc.)
        metadata: {
            chatId,
            orderId: 'your-order-id', // Replace or generate dynamically
        },
        token: ZCP_TOKEN, // Include token in the payload
        secret_key: ZCP_SECRET_KEY, // Include secret key in the payload
    }

    try {
        const response = await axios.post(
            'https://Zerocryptopay.com/pay/newtrack/',
            paymentPayload,
            {
                headers: {
                    Authorization: `Bearer ${ZCP_TOKEN}`,
                    'X-Secret-Key': ZCP_SECRET_KEY,
                    'Content-Type': 'application/json',
                },
            }
        )

        console.log('response: ', response.data)
        const paymentUrl = response.data.payment_url

        await bot.sendMessage(
            chatId,
            `Please complete your payment by clicking the link below:\n${paymentUrl}`
        )
        // Answer the callback query to remove the loading spinner on Telegram
        await bot.answerCallbackQuery(callbackQueryId)
    } catch (error) {
        console.error(
            'Error creating payment:',
            error.response ? error.response.data : error.message
        )
        await bot.sendMessage(
            chatId,
            'There was an error processing your payment. Please try again later.'
        )
        await bot.answerCallbackQuery(callbackQueryId)
    }
    return
}

const confirmInput = (message) => {
    // Ensure we declare our variables properly
    const serviceName = serviceSelected.replace('service_', '')
    const userInput = message.text

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Confirm', callback_data: 'confirm' },
                    { text: 'Cancel', callback_data: 'cancel' },
                ],
            ],
        },
    }

    // Ask the user to confirm their input
    bot.sendMessage(
        message.chat.id,
        `Confirm this input:\n\n- You selected ${serviceName}.\n- ${userInput}.`,
        options
    )
}

const getInput = async (message) => {
    const chatId = message.chat.id
    const senderName = message.from.first_name
    const senderMessage = message.text
    const isMessageSpecialCommands = SPECIAL_COMMANDS.includes(senderMessage)

    if (!isBotAskingForInput && !isMessageSpecialCommands) {
        return await bot.sendMessage(
            chatId,
            `I didn’t get that, ${senderName}. Start by typing /start`
        )
    }

    if (!isMessageSpecialCommands) {
        confirmInput(message)
    }
}

bot.on('message', getInput)

bot.onText(/\/services/, async (msg) => {
    const chatId = msg.chat.id
    isBotAskingForInput = false
    const options = {
        reply_markup: {
            inline_keyboard: Object.keys(SERVICES).map((category) => [
                { text: category, callback_data: category },
            ]),
        },
    }
    await bot.sendMessage(chatId, 'Select a service category: ', options)
})

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id
    const selectedData = callbackQuery.data
    
    // this is only temporary
    if (selectedData === 'yes') {
        // store in notionRequest
        return 
    }

    if (selectedData === 'confirm') {
        await bot.sendMessage(chatId, 'processing please wait')

        return temporaryFunction(callbackQuery)
        // return createPayment(chatId, callbackQuery.id) figure out how to implement this
    }

    if (selectedData === 'cancel') {
        // TODO: make a logic where it gets back to main menu
    }

    if (!selectedData.startsWith('service_')) {
        const options = {
            reply_markup: {
                inline_keyboard: SERVICES[selectedData].map((service) => [
                    {
                        text: `${service.name} - ${service.price} USDT`,
                        callback_data: `service_${service.name}`,
                    },
                ]),
            },
        }

        categorySelected = selectedData

        return await bot.sendMessage(
            chatId,
            `Select a specific service in ${categorySelected},\ntype '/services' if you want go back to Main Menu`,
            options
        )
    }

    isBotAskingForInput = true
    serviceSelected = selectedData

    if (categorySelected === 'Spies') {
        return await bot.sendMessage(
            chatId,
            'Please enter the Ad Library Link.'
        )
    }

    if (SERVICE_ACCOUNT_ID.includes(serviceSelected)) {
        return await bot.sendMessage(chatId, 'Please enter the Ad Account ID.')
    }

    if (serviceSelected === 'service_Profile') {
        return await bot.sendMessage(chatId, 'Please enter the Profile link.')
    }

    if (SERVICE_PAGE.includes(serviceSelected)) {
        return await bot.sendMessage(chatId, 'Please enter the Page link.')
    }

    if (serviceSelected === 'service_BM') {
        return await bot.sendMessage(chatId, 'Please enter BM ID.')
    }

    if (serviceSelected === 'service_Per Ad') {
        return await bot.sendMessage(chatId, 'Please enter Ad ID.')
    }

    if (!SERVICES[serviceSelected]) {
        return await bot.sendMessage(
            chatId,
            'Invalid selected input, please type /start again.'
        )
    }
})

function startBot() {
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id
        categorySelected = ''
        isBotAskingForInput = false

        await bot.sendMessage(
            chatId,
            "Welcome to Test Blight Stone Bot, \n\ntype '/services' to start"
        )
    })
}

if (process.env.NOTION_TOKEN && process.env.NOTION_TOKEN) {
    startBot()
}
