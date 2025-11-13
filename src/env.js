require('dotenv').config();

const ENV = {
  port: Number(process.env.PORT || 8000),
  jwtSecret: process.env.JWT_SECRET || 'dev', // will matter later
};

module.exports = { ENV };
