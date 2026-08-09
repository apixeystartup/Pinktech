import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nutrimax-saas',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-do-not-use-in-prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  nodeEnv: process.env.NODE_ENV || 'development',
};
