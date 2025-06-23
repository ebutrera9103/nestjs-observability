# --- Stage 1: Build the application ---
# Use a specific Node.js version for consistency. Alpine versions are small.
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# --- THIS IS THE FIX ---
# Run the script that builds the entire project, including the test app
RUN npm run build:all

# --- Stage 2: Create the final, optimized production image ---
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

# Copy the entire compiled 'dist' folder from the 'builder' stage
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

# Update the command to run the test app's main file
CMD [ "node", "dist/test-app/main" ]
