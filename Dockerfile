FROM node:16-alpine

# Create app directory
WORKDIR /var/www/aib

COPY . .

RUN npm install

RUN npm run build

EXPOSE 3000

CMD [ "npm", "run", "start" ]
