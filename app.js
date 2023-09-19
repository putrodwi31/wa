const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cron = require('node-cron');
const express = require('express');
const session = require('express-session');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const app = express();
require('dotenv').config();
const connection = require('./database')
const server = http.createServer(app);
const authCode = process.env.AUTH_KODE;
const io = socketIO(server, {
    cors: {
        origin: '*'
    }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: '@123@qwe#!', resave: true, saveUninitialized: true }));
app.use(fileUpload({
    debug: false
}));
app.get('/', (req, res) => {
    connection.query('SELECT * FROM session_whatsapp WHERE id=1', function (err, rows) {
        if (err) {
        } else {
            res.status(200).json({
                status: true,
                response: rows.length
            });
            rows.forEach(item => {
                console.log(item.status)
            });
        }
    });
    // res.sendFile('index.html', { root: __dirname });
})

let cronjobb;
let run = false;
let logOut;
let jobRun = false;
let destroy;
function newSession() {
    const client = new Client({
        restartOnAuthFail: true,
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // <- this one doesn't works in Windows
                '--disable-gpu'
            ],
        },
        authStrategy: new LocalAuth()
    });

    client.on('loading_screen', (percent, message) => {
        io?.emit('message', `Menunggu koneksi ke whatsapp ` + percent + `%`);
    });
    client.on('qr', (qr) => {
        qrcode.toDataURL(qr, (err, url) => {
            io?.emit('qr', url);
            io?.emit('message', 'QR Code diterima, silahkan pindai');
        });
    });
    client.on('ready', () => {
        io?.emit('message', 'API Whatsapp siap digunakan');
        io?.emit('ready', 'API Whatsapp siap digunakan');
        cronjobb.start();
    });
    client.on('authenticated', () => {
        connection.query('UPDATE session_whatsapp SET status=1 WHERE id=1', function (err, rows) {
            if (err) {
                io?.emit('message', 'Gagal input sesi ke database');
            } else {
                io?.emit('authenticated', 'Whatsapp diautentikasi');
                io?.emit('message', 'Whatsapp diautentikasi');
            }
        });
    });
    client.on('auth_failure', msg => {
        io?.emit('message', `Whatsapp gagal diautentikasi ` + msg);
    });
    client.on('disconnected', () => {
        connection.query('UPDATE session_whatsapp SET status=0 WHERE id=1', function (err, rows) {
            if (err) {
                io?.emit('message', 'Gagal update sesi ke database');
            } else {
                io?.emit('message', 'Akun telah keluar dari Whatsapp');
                try {
                    // Destroy actual browser
                    client.destroy()
                    // Send command to restart the instance
                    setTimeout(() => {
                        newSession()
                    }, 3000)
                } catch (error) {
                    console.error('Error on session finished. %s', error);
                }
            }
        });


    })
    // client.on('message', message => {
    //     if (message.body === 'bungkar') {
    //         message.reply('pong');
    //     } else if (message.body === '!biu') {
    //         message.reply(`*Selamat Datang Di Universitas Bina Insani*\nMenu Pilihan : \n1. Daftar Prodi\n2. Daftar Harga\n0. Keluar\nMasukan Angka menu yang ingin anda pilih`);
    //     }
    // });
    const checkRegisteredNumber = async function (number) {
        const isRegistered = await client.isRegisteredUser(number);
        return isRegistered
    }

    logOut = async function () {
        const isLogout = await client.logout();
        return isLogout
    }
    destroy = async function () {
        const destroyed = await client.destroy();
        return destroyed
    }
    app.post('/check-number', [
        body('number').notEmpty(),
        body('auth').notEmpty(),
    ], async (req, res) => {
        const errors = validationResult(req).formatWith(({ msg }) => {
            return msg;
        })
        if (!errors.isEmpty()) {
            return res.status(422).json({
                status: false,
                message: errors.mapped()
            })
        }
        if (req.body.auth == authCode) {
            const number = phoneNumberFormatter(req.body.number);
            const message = req.body.message;

            const isRegisteredNumber = await checkRegisteredNumber(number);

            if (!isRegisteredNumber) {
                return res.status(422).json({
                    status: false,
                    message: 'Nomor tidak terdaftar di whatsaap',
                    x: req.body.x
                })
            }
            res.status(200).json({
                status: true,
                message: 'Nomor terdaftar',
                x: req.body.x
            });

        } else {
            res.status(500).json({
                status: false,
                message: 'Akses Tidak Diizinkan'
            })
        }

    });

    app.post('/send-message', [
        body('number').notEmpty(),
        body('message').notEmpty(),
        body('auth').notEmpty()
    ], async (req, res) => {
        const errors = validationResult(req).formatWith(({ msg }) => {
            return msg;
        })

        if (!errors.isEmpty()) {
            return res.status(422).json({
                status: false,
                message: errors.mapped()
            })
        }
        if (req.body.auth == authCode) {
            const number = phoneNumberFormatter(req.body.number);
            const message = req.body.message;

            const isRegisteredNumber = await checkRegisteredNumber(number);

            if (!isRegisteredNumber) {
                return res.status(422).json({
                    status: false,
                    message: 'The number  is not registered'
                })
            }

            client.sendMessage(number, message).then(response => {
                res.status(200).json({
                    status: true,
                    response: response
                });
            }).catch(err => {
                res.status(500).json({
                    status: false,
                    response: err
                })
            });
        } else {
            res.status(500).json({
                status: false,
                response: 'Akses Tidak Diizinkan'
            })
        }

    });

    app.post('/send-media', [
        body('number').notEmpty(),
        body('caption').notEmpty(),
        body('path').notEmpty(),
        body('auth').notEmpty()
    ], async (req, res) => {

        const errors = validationResult(req).formatWith(({ msg }) => {
            return msg;
        })

        if (!errors.isEmpty()) {
            return res.status(422).json({
                status: false,
                message: errors.mapped()
            })
        }
        if (req.body.auth == authCode) {
            const number = phoneNumberFormatter(req.body.number);
            const caption = req.body.caption;
            const filePath = req.body.path;

            const isRegisteredNumber = await checkRegisteredNumber(number);
            if (!isRegisteredNumber) {
                return res.status(422).json({
                    status: false,
                    message: 'The number  is not registered'
                })
            }

            const media = MessageMedia.fromFilePath(filePath);
            client.sendMessage(number, media, { caption: caption }).then(response => {
                res.status(200).json({
                    status: true,
                    response: response
                });
            }).catch(err => {
                res.status(500).json({
                    status: false,
                    response: err
                })
            });
        } else {
            res.status(500).json({
                status: false,
                response: 'Akses Tidak Diizinkan'
            })
        }
    });
    client.initialize();
    run = true;
    // cronjobb = cron.schedule('*/10 * * * * *', () => {
    cronjobb = cron.schedule('*/10 * * * * *', () => {
        if (jobRun == false) {
            connection.query('SELECT * FROM message_schedule LIMIT 3', function (err, rows) {
                if (!err) {
                    if (rows.length > 0) {
                        jobRun = true
                        rows.forEach(async d => {
                            const number = phoneNumberFormatter(d.number);
                            const isRegisteredNumber = await checkRegisteredNumber(number);

                            if (!isRegisteredNumber) {
                                connection.query(`DELETE FROM message_schedule WHERE id = ${d.id}`)
                                return;
                            }
                            switch (d.jenis) {
                                case 1:
                                    client.sendMessage(number, d.message).then(response => {
                                        connection.query(`DELETE FROM message_schedule WHERE id = ${d.id}`)
                                    }).catch(err => {
                                    });
                                    break;
                                case 2:
                                    const media = MessageMedia.fromFilePath(d.media);
                                    client.sendMessage(number, media, { caption: d.message }).then(response => {
                                        connection.query(`DELETE FROM message_schedule WHERE id = ${d.id}`)
                                    }).catch(err => {
                                    });
                                    break;
                                default:
                                    break;
                            }
                        });
                        jobRun = false
                    }
                }
            })
        }
    }, {
        scheduled: false
    });

}
//socket IO
io.on('connection', function (socket) {
    socket.emit('message', 'Menghubungkan ke server');
    connection.query('SELECT * FROM session_whatsapp WHERE id=1', function (err, rows) {
        if (err) {
            socket.emit('message', 'Gagal mengambil sesi di database');
        } else {
            if (rows[0]['status'] == 1) {
                socket.emit('message', 'Whatsapp Siap Digunakan');
            } else if (run == false) {
                newSession();
            }
        }
    });
    socket.on('logout', async () => {
        const isLogout = await logOut().then(response => {
            socket.emit('message', 'Berhasil keluar akun whatsapp');
        }).catch(err => {
            socket.emit('message', 'Gagal keluar akun whatsapp');
        });
    })
})
if (run == false) {
    newSession();
}

server.listen(8000, function () {
    console.log('App running on *: 8000');
})