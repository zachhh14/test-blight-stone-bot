require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const { Client } = require('@notionhq/client')
const { ZeroCryptoPay } = require('zerocryptopay')
const QRCode = require('qrcode')

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
    servicePrice: 0,
}

let isBotAskingForInput = false
let isTransactionInProcess = false

const notionRequest = async (paymentUrl) => {
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
                    number: userState.servicePrice,
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
                'Payment URL:': {
                    url: paymentUrl,
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

const createPayment = async (chatId) => {
    bot.sendMessage(chatId, 'Creating payment...')
    const LOGIN = 'blightstone@pm.me'
    const SECRET_KEY_FROM_DASHBOARD = ZCP_SECRET_KEY
    const TOKEN_FROM_DASHBOARD = ZCP_TOKEN

    const signatureData = {
        login: LOGIN,
        amount: userState.servicePrice,
        secretKey: SECRET_KEY_FROM_DASHBOARD,
        orderId: Date.now(),
    }

    try {
        const signature = ZeroCryptoPay.createSign(signatureData)
        const orderData = {
            ...signatureData,
            token: TOKEN_FROM_DASHBOARD,
            signature,
        }

        const order = await ZeroCryptoPay.createOrder(orderData)

        if (!order || order.status === false) {
            console.log('something went wrong while creating an order', order)
            return bot.sendMessage(
                chatId,
                'Failed to create payment. Please try again.'
            )
        }

        // TODO: make the `url_to_pay` shorter, probably by tinyurl or bitly

        try {
            const qrBuffer = await QRCode.toBuffer(order.url_to_pay, {
                width: 250, // Set a fixed width (will maintain square ratio)
                margin: 1, // Minimal white margin around QR
                scale: 8, // Scale factor for QR modules
                errorCorrectionLevel: 'H', // Highest error correction level
            })
            await bot.sendPhoto(chatId, qrBuffer, {
                caption: `Make a payment by scanning this QR code or clicking this link:\n${order.url_to_pay}.\n\nYou have 20 attempts.`,
            })
        } catch (error) {
            console.error('Error generating QR code:', error)
            await bot.sendMessage(
                chatId,
                `Make a payment to ${order.url_to_pay}`
            )
        }

        const checkOrderSign = ZeroCryptoPay.createCheckOrderSign({
            token: TOKEN_FROM_DASHBOARD,
            transactionHash: order.hash_trans,
            secretKey: SECRET_KEY_FROM_DASHBOARD,
            trackingId: order.id,
            login: LOGIN,
        })

        let attempts = 20
        const checkPayment = async () => {
            if (attempts <= 0) {
                await bot.sendMessage(
                    chatId,
                    'Payment time expired. Please try again.'
                )
                return
            }

            const orderStatus = await ZeroCryptoPay.checkOrder({
                trackingId: order.id,
                signature: checkOrderSign,
                token: TOKEN_FROM_DASHBOARD,
                transactionHash: order.hash_trans,
                login: LOGIN,
            })

            if (orderStatus && orderStatus.status === 'paid') {
                try {
                    await notionRequest(order.url_to_pay)
                    await bot.sendMessage(
                        chatId,
                        'Payment received! Your order has been processed.'
                    )
                } catch (error) {
                    console.error('Error storing in Notion: ', error)
                    await bot.sendMessage(
                        chatId,
                        'Payment received but there was an error processing your order. Please contact support.'
                    )
                }
                return
            }
            if (orderStatus && orderStatus.status === 'expired') {
                await bot.sendMessage(
                    chatId,
                    'Payment expired. Please try again.'
                )
                startBot(chatId)

                return
            }
            attempts--
            await bot.sendMessage(
                chatId,
                `Waiting for payment... ${attempts} attempts remaining.\nChecking again in 30 seconds.`
            )
            setTimeout(checkPayment, 30000) // Check again in 30 seconds
        }

        // Start checking for payment
        checkPayment()
    } catch (error) {
        console.error(error)
        return bot.sendMessage(
            chatId,
            'Something went wrong while creating a payment'
        )
    }
}

const confirmInput = (message) => {
    const serviceName = userState.serviceSelected.replace('service_', '')
    const servicePrice = Object.values(SERVICES)
        .flat()
        .find((service) => service.name === serviceName)?.price
    const userInput = message.text
    userState.userInfo = userInput

    userState.servicePrice = servicePrice

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
        `Confirm this input:\n\n- You selected ${serviceName}\n- Price: ${servicePrice} USDT\n- ${userInput}`,
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
            `I didn't get that, ${senderName}. Start by typing /start`
        )
    }

    if (isTransactionInProcess) {
        return await bot.sendMessage(
            chatId,
            'Transaction is already in process. Please wait for it to complete.'
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

    if (isTransactionInProcess) {
        return await bot.sendMessage(
            chatId,
            'Transaction is already in process'
        )
    }

    if (selectedData === 'confirm') {
        isTransactionInProcess = true
        await bot.sendMessage(chatId, 'processing please wait')

        return createPayment(chatId)
    }

    if (selectedData === 'cancel') {
        isBotAskingForInput = false
        await bot.sendMessage(chatId, 'cancelled')
        return startBot(chatId)
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

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id
    userState.categorySelected = ''
    isBotAskingForInput = false

    startBot(chatId)
})

const startBot = async (chatId) => {
    await bot.sendMessage(
        chatId,
        "Welcome to Test Blight Stone Bot, \n\ntype '/services' to start"
    )
}
