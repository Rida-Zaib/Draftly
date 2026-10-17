FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY client/package*.json ./client/
RUN npm --prefix client install
COPY . .
RUN npm run build
ENV PORT=7860
ENV DB_FILE=/tmp/data.db
EXPOSE 7860
CMD ["npm", "start"]