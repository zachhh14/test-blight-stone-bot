require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const { Client } = require('@notionhq/client')
const telegramToken = process.env.TELEGRAM_TOKEN
const notionToken = process.env.NOTION_TOKEN

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
let userInput = {}
let isBotAskingForInput = false

const confirmInput = (message) => {
    serviceName = serviceSelected.replace('service_', '')

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

    // TODO: make a logic where if the user confirmed, it opens the payment gateay
    bot.sendMessage(
        message.chat.id,
        `Confirm this input:\n\n- You selected ${serviceName}.\n-${userInput}.`,
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

    userInput = senderMessage

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

    return await bot.sendMessage(chatId, 'Select a service category: ', options)
})

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id
    const selectedData = callbackQuery.data

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
            `Select a specific service in ${categorySelected},\ntype '/services' if you want go back to mainmenu`,
            options
        )
    }

    isBotAskingForInput = true
    serviceSelected = selectedData

    if (categorySelected === 'Spies') {
        return await bot.sendMessage(
            chatId,
            `Please enter the Ad Library Link.`
        )
    }

    if (SERVICE_ACCOUNT_ID.includes(serviceSelected)) {
        return await bot.sendMessage(chatId, `Please enter the Ad Account ID.`)
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

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id
    categorySelected = ''
    serviceSelected = ''
    userInput = ''
    isBotAskingForInput = false

    return await bot.sendMessage(
        chatId,
        "Welcome to Test Blight Stone Bot, \n\ntype '/services' to start"
    )
})
