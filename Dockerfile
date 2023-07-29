# Start your image with a node base image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy the rest of the application files
COPY . .

# Install project dependencies
RUN npm install

# Expose the necessary port for the Telegram bot
# EXPOSE 3000

# Start the Telegram bot using long polling
CMD ["node", "src/index.js"]