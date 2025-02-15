require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const { Client } = require('@notionhq/client')
const telegramToken = process.env.TELEGRAM_TOKEN
const notionToken = process.env.NOTION_TOKEN
console.log('hello')

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
let isBotAskingForInput = false

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
        // prcoess order
        bot.sendMessage(chatId, senderMessage)
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

    if (categorySelected === 'Spies') {
        return await bot.sendMessage(
            chatId,
            `Please enter the Ad Library Link.`
        )
    }

    if (SERVICE_ACCOUNT_ID.includes(selectedData)) {
        return await bot.sendMessage(chatId, `Please enter the Ad Account ID.`)
    }

    if (selectedData === 'service_Profile') {
        return await bot.sendMessage(chatId, 'Please enter the Profile link.')
    }

    if (SERVICE_PAGE.includes(selectedData)) {
        return await bot.sendMessage(chatId, 'Please enter the Page link.')
    }

    if (selectedData === 'service_BM') {
        return await bot.sendMessage(chatId, 'Please enter BM ID.')
    }

    if (selectedData === 'service_Per Ad') {
        return await bot.sendMessage(chatId, 'Please enter Ad ID.')
    }

    if (!SERVICES[selectedData]) {
        return await bot.sendMessage(
            chatId,
            'Invalid selected input, please type /start again.'
        )
    }
})

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id
    categorySelected = ''
    isBotAskingForInput = false

    await bot.sendMessage(
        chatId,
        "Welcome to Test Blight Stone Bot, \n\ntype '/services' to start"
    )
})
