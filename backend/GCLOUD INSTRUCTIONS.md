# Crear instancia de Redis (Tier BASIC para MVP, es más barato)
gcloud redis instances create interledger-redis \
  --size=1 \
  --region=us-central1 \
  --tier=BASIC \
  --redis-version=redis_7_0 \
  --network=default

# Este comando tarda unos 5-10 minutos
# Puedes ver el progreso con:
gcloud redis instances list --region=us-central1

# Conextor de VPC para acceder a redis
# Crear VPC Connector
gcloud compute networks vpc-access connectors create interledger-connector \
  --region=us-central1 \
  --network=default \
  --range=10.8.0.0/28 \
  --min-instances=2 \
  --max-instances=3

# Verificar que se creó
gcloud compute networks vpc-access connectors describe interledger-connector \
  --region=us-central1



# Crear secret para private key
gcloud secrets create interledger-private-key \
  --data-file=dev.key \
  --replication-policy="automatic"

# Crear secret para firebase service account
gcloud secrets create interledger-datastore-sa \
  --data-file=./credentials.json \
  --replication-policy="automatic"

# Verificar que se crearon
gcloud secrets list


# Obtener el número de tu proyecto
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

# Dar permisos de Secret Manager
gcloud secrets add-iam-policy-binding interledger-private-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding interledger-datastore-sa \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"


# Configurar artifact 
  # Crear repositorio en Artifact Registry
gcloud artifacts repositories create openpayments-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="Interledger backend repository"

# Configurar Docker para usar gcloud
gcloud auth configure-docker us-central1-docker.pkg.dev



# Definir variables
PROJECT_ID=$(gcloud config get-value project)
IMAGE_NAME="interledger-backend"
IMAGE_TAG="latest"
FULL_IMAGE_PATH="us-central1-docker.pkg.dev/${PROJECT_ID}/openpayments-repo/${IMAGE_NAME}:${IMAGE_TAG}"

# Build de la imagen
docker build -f Dockerfile -t ${FULL_IMAGE_PATH} .

# Push a Artifact Registry
docker push ${FULL_IMAGE_PATH}

echo "✅ Imagen subida: ${FULL_IMAGE_PATH}"


# DEPLOY A CLOUD RUN 

REDIS_IP="10.6.101.51"   

gcloud run deploy interledger-backend \
  --image=us-central1-docker.pkg.dev/cedar-catfish-473700-s6/openpayments-repo/interledger-backend:latest \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --vpc-connector=interledger-connector \
  --vpc-egress=private-ranges-only \
  --set-env-vars="NODE_ENV=production,REDIS_HOST=10.6.101.51,REDIS_PORT=6379,REDIS_PASSWORD=secretpassword,GCP_PROJECT_ID=cedar-catfish-473700-s6,FIRESTORE_DATABASE_ID=opendb,WALLET_ADDRESS_URL=https://ilp.interledger-test.dev/angeel,KEY_ID=51f01e2b-97c5-4a38-9df6-e9e7b8309a71,PRIVATE_KEY_PATH=/secrets/private/dev.key,GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase/credentials.json,FRONTEND_URL=*" \
  --set-secrets="/secrets/private/dev.key=interledger-private-key:latest,/secrets/firebase/credentials.json=interledger-datastore-sa:latest"







  # Build para la plataforma correcta
docker build --platform linux/amd64 -f Dockerfile -t us-central1-docker.pkg.dev/cedar-catfish-473700-s6/openpayments-repo/interledger-backend:latest .
docker build --platform linux/amd64 -f Dockerfile -t us-central1-docker.pkg.dev/cedar-catfish-473700-s6/openpayments-repo/interledger-backend:latest .


# Push
docker push us-central1-docker.pkg.dev/cedar-catfish-473700-s6/openpayments-repo/interledger-backend:latest

# Deploy
gcloud run deploy interledger-backend \
  --image=us-central1-docker.pkg.dev/cedar-catfish-473700-s6/openpayments-repo/interledger-backend:latest \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --vpc-connector=interledger-connector \
  --vpc-egress=private-ranges-only \
  --set-env-vars="NODE_ENV=production,REDIS_HOST=10.6.101.51,REDIS_PORT=6379,REDIS_PASSWORD=secretpassword,GCP_PROJECT_ID=cedar-catfish-473700-s6,FIRESTORE_DATABASE_ID=opendb,WALLET_ADDRESS_URL=https://ilp.interledger-test.dev/angeel,KEY_ID=51f01e2b-97c5-4a38-9df6-e9e7b8309a71,PRIVATE_KEY_PATH=/secrets/private/dev.key,GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase/credentials.json,FRONTEND_URL=*" \
  --set-secrets="/secrets/private/dev.key=interledger-private-key:latest,/secrets/firebase/credentials.json=interledger-datastore-sa:latest"

  gcloud run deploy interledger-backend \
  --image=us-central1-docker.pkg.dev/cedar-catfish-473700-s6/openpayments-repo/interledger-backend:latest \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --vpc-connector=interledger-connector \
  --vpc-egress=private-ranges-only \
  --set-env-vars="NODE_ENV=production,REDIS_HOST=10.6.101.51,REDIS_PORT=6379,GCP_PROJECT_ID=cedar-catfish-473700-s6,FIRESTORE_DATABASE_ID=opendb,WALLET_ADDRESS_URL=https://ilp.interledger-test.dev/angeel,KEY_ID=51f01e2b-97c5-4a38-9df6-e9e7b8309a71,PRIVATE_KEY_PATH=/secrets/private/dev.key,GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase/credentials.json,FRONTEND_URL=*" \
  --set-secrets="/secrets/private/dev.key=interledger-private-key:latest,/secrets/firebase/credentials.json=interledger-datastore-sa:latest"