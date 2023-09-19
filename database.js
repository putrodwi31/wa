let mysql = require('mysql');
require('dotenv').config();

let connection = mysql.createConnection({
    host: process.env.DB_HOSTNAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});

connection.connect(function (error) {
    if (!!error) {
        console.log(error);
    } else {
        console.log('Koneksi Berhasil!');
    }
})

module.exports = connection; 