# Lancer Ollama (à laisser ouvert)
Start-Process powershell -ArgumentList "ollama serve"

# Attendre 3 secondes pour s'assurer que le serveur Ollama est prêt
Start-Sleep -Seconds 3

# Lancer le serveur Node.js
node server.js