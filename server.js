require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const { Client } = require('@notionhq/client')
const axios = require('axios')
const { ZeroCryptoPay } = require('zerocryptopay')

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
    const LOGIN = 'blightstone@pm.me'
    const SECRET_KEY_FROM_DASHBOARD = ZCP_SECRET_KEY
    const TOKEN_FROM_DASHBOARD = ZCP_TOKEN

    const signatureData = {
        login: LOGIN,
        amount: 100,
        secretKey: SECRET_KEY_FROM_DASHBOARD,
        orderId: Date.now(),
    }

    const signature = ZeroCryptoPay.createSign(signatureData)

    const orderData = {
        ...signatureData,
        token: TOKEN_FROM_DASHBOARD,
        signature,
    }

    console.log(orderData)

    const order = await ZeroCryptoPay.createOrder(orderData)

    if (order.status === false) {
        console.log('something went wrong while creating an order', order)
        return
    }

    console.log('redirect your client to', order.url_to_pay)

    // ZeroCryptoPay.checkOrder
    const checkOrderSign = ZeroCryptoPay.createCheckOrderSign({
        token: TOKEN_FROM_DASHBOARD,
        transactionHash: order.hash_trans,
        secretKey: SECRET_KEY_FROM_DASHBOARD,
        trackingId: order.id,
        login: LOGIN,
    })

    const orderStatus = await ZeroCryptoPay.checkOrder({
        trackingId: order.id,
        signature: checkOrderSign,
        token: TOKEN_FROM_DASHBOARD,
        transactionHash: order.hash_trans,
        login: LOGIN,
    })

    console.log('orderStatus', orderStatus)

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

        // return temporaryFunction(callbackQuery)
        return createPayment(chatId, callbackQuery.id)
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
