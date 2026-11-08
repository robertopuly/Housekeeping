# Dockerfile per Housekeeping (Gestion & Communication Hôtel)
# Usa Node.js 22 Alpine (include il modulo nativo node:sqlite)
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8765
ENV DB_PATH=/app/data/data.db
ENV TZ=Europe/Zurich

# Copia file dipendenze e installa dipendenze di produzione
COPY package*.json ./
RUN npm install --omit=dev

# Copia codice sorgente
COPY . .

# Cartelle persistenti per database e upload
RUN mkdir -p /app/data /app/public/uploads

EXPOSE 8765

CMD ["node", "server.js"]
