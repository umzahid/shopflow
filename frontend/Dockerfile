# Placeholder — replaced in Week 3 when Next.js app is scaffolded
FROM node:20-alpine
RUN apk add --no-cache wget
WORKDIR /app
RUN echo '{"name":"shopflow-frontend","version":"0.0.1","scripts":{"start":"node server.js"}}' > package.json
RUN echo 'const http = require("http"); http.createServer((req,res) => { res.writeHead(200); res.end("ShopFlow frontend — coming in Week 3"); }).listen(3000);' > server.js
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O- http://localhost:3000 || exit 1
CMD ["node", "server.js"]
