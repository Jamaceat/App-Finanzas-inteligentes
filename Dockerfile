FROM reactnativecommunity/react-native-android:latest

# Instalar rsync para sincronización rápida
RUN apt-get update && apt-get install -y rsync && rm -rf /var/lib/apt/lists/*

# Establecer el directorio de trabajo
WORKDIR /app

# Carpeta donde se montará el volumen para extraer el APK
RUN mkdir -p /output

# Copiar el script de compilación al contenedor
COPY scripts/docker-build.sh /usr/local/bin/docker-build.sh
RUN chmod +x /usr/local/bin/docker-build.sh

# Comando por defecto que ejecuta el flujo de compilación desde el script interno
CMD ["/usr/local/bin/docker-build.sh"]
