FROM node:22-alpine

WORKDIR /app

# Copia delle dipendenze
COPY package*.json ./

# Installazione dipendenze di produzione
RUN npm install --omit=dev

# Copia del codice dell'applicazione
COPY . .

# Creazione cartelle per persistenza dati e foto
RUN mkdir -p /app/data /app/public/uploads

# Porta standard
EXPOSE 8765

# Variabili d'ambiente predefinite
ENV PORT=8765
ENV NODE_ENV=production
ENV DB_PATH=/app/data/data.db

# Avvio del server Node.js
CMD ["node", "server.js"]
