FROM node:26.12.1-alpine3.24
WORKDIR /app
COPY --chown=node:node *.html *.css *.js *.mjs ./
COPY --chown=node:node fonts ./fonts
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
