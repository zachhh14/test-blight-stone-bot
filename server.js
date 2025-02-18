require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const { Client } = require('@notionhq/client')
const axios = require('axios')

const {
    SERVICES,
    SPECIAL_COMMANDS,
    SERVICE_ACCOUNT_ID,
    SERVICE_PAGE,
    TELEGRAM_TOKEN,
    NOTION_TOKEN,
    NOTION_DATABASE_ID,
    ZCP_SECRET_KEY,
    ZCP_TOKEN,
} = require('./lib/constants')

// TODO: change this to webhooks in production
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true })
const notion = new Client({ auth: NOTION_TOKEN })

let userState = {
    categorySelected: '',
    serviceSelected: '',
    userInfo: '',
}

let isBotAskingForInput = false

const notionRequest = async () => {
    const isUrl = userState.userInfo.startsWith('http')

    try {
        const response = await notion.pages.create({
            parent: { database_id: NOTION_DATABASE_ID },
            properties: {
                Name: {
                    title: [{ text: { content: userState.serviceSelected } }],
                },
                Category: {
                    select: { name: userState.categorySelected },
                },
                Price: {
                    number: 1000, // TODO: make this dynamic
                },
                'Ordered By': {
                    rich_text: [
                        {
                            text: {
                                content: `User ID: ${1}`,
                            },
                        },
                    ],
                },
                'User Info': {
                    rich_text: isUrl
                        ? [
                              {
                                  text: { content: 'Ad Account ID: ' },
                              },
                              {
                                  text: {
                                      content: userState.userInfo,
                                      link: { url: userState.userInfo },
                                  },
                              },
                          ]
                        : [
                              {
                                  text: {
                                      content: `Ad Account ID: ${userState.userInfo}`,
                                  },
                              },
                          ],
                },
                Timestamp: {
                    date: { start: new Date().toISOString() },
                },
            },
        })
        console.log('Order saved to Notion: ', response.id)

        return response
    } catch (error) {
        console.error(error.message)
        console.error(error)

        throw error
    }

}

const temporaryFunction = async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id
    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'No', callback_data: 'no' },
                    { text: 'Yes', callback_data: 'yes' },
                ],
            ],
        },
    }

    return await bot.sendMessage(chatId, 'Nagbayad ka na?', options)
}

const createPayment = async (chatId, callbackQueryId) => {
    // temporary variable
    const paymentPayload = {
        amount: 100,
        currency: 'USDT',
        // URL that ZeroCryptoPay should call after payment is processed
        callback_url: 'https://yourdomain.com/payment/callback',
        success_url: 'https://yourdomain.com/payment/success',
        error_url: 'https://yourdomain.com/payment/error',
        metadata: {
            chatId,
            orderId: 'your-order-id', // TODO: Replace or generate dynamically
        },
        token: ZCP_TOKEN,
        secret_key: ZCP_SECRET_KEY,
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

        const paymentUrl = response.data.payment_url

        await bot.sendMessage(
            chatId,
            `Please complete your payment by clicking the link below:\n${paymentUrl}`
        )

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
    const serviceName = userState.serviceSelected.replace('service_', '')
    const userInput = message.text
    userState.userInfo = userInput

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Cancel', callback_data: 'cancel' },
                    { text: 'Confirm', callback_data: 'confirm' },
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
                { text: category, callback_data: `${category}` },
            ]),
        },
    }

    return await bot.sendMessage(chatId, 'Select a service category: ', options)
})

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id
    const selectedData = callbackQuery.data

    // this is only temporary
    if (selectedData === 'yes') {
        // TODO: store in notionRequest
        notionRequest()
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

        userState = {
            categorySelected: selectedData,
        }

        userState.categorySelected = selectedData

        return await bot.sendMessage(
            chatId,
            `Select a specific service in ${userState.categorySelected},\ntype '/services' if you want go back to Main Menu`,
            options
        )
    }

    isBotAskingForInput = true

    userState.serviceSelected = selectedData

    if (userState.categorySelected === 'Spies') {
        return await bot.sendMessage(
            chatId,
            'Please enter the Ad Library Link.'
        )
    }

    if (SERVICE_ACCOUNT_ID.includes(userState.serviceSelected)) {
        return await bot.sendMessage(chatId, 'Please enter the Ad Account ID.')
    }

    if (userState.serviceSelected === 'service_Profile') {
        return await bot.sendMessage(chatId, 'Please enter the Profile link.')
    }

    if (SERVICE_PAGE.includes(userState.serviceSelected)) {
        return await bot.sendMessage(chatId, 'Please enter the Page link.')
    }

    if (userState.serviceSelected === 'service_BM') {
        return await bot.sendMessage(chatId, 'Please enter BM ID.')
    }

    if (userState.serviceSelected === 'service_Per Ad') {
        return await bot.sendMessage(chatId, 'Please enter Ad ID.')
    }

    if (!SERVICES[userState.serviceSelected]) {
        return await bot.sendMessage(
            chatId,
            'Invalid selected input, please type /start again.'
        )
    }
})

function startBot() {
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id
        userState.categorySelected = ''
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
