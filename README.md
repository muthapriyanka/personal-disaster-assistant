# 🌪️ Personal Disaster Assistant (Backend)

A **Node.js + PostgreSQL** backend that provides **real-time disaster alerts** and **personalized guidance** for users in the United States.  
It fetches live **earthquake** and **shelter** data, stores it locally, and lets users register, save places, and receive alerts for hazards near them.

---

## 🚀 Features

- 🔐 JWT-based Authentication (Register / Login)
- 🗺️ Save user locations (`/places`)
- 🌋 Real-time **Earthquake** ingestion (USGS API)
- 🏕️ Live **Shelter** ingestion (FEMA / NAPSG Open Shelters)
- 📢 Personalized **Alert** pipeline
- 🌎 `/overview` endpoint — shows earthquakes + nearest shelters
- 🧭 Built entirely with native **Node.js HTTP** (no frameworks)

---

## 🧩 Tech Stack
| Layer | Technology |
|--------|-------------|
| Backend | Node.js (HTTP) |
| Database | PostgreSQL |
| Auth | JSON Web Tokens (JWT) |
| APIs | USGS Earthquake Feed, FEMA/NAPSG Shelter Feed |

---

## 🧠 Run Locally

### 0️⃣ Prereqs
- Node ≥ 18  
- PostgreSQL ≥ 14  
- curl (for quick testing)

macOS (Homebrew):

brew install node postgresql@16
brew services start postgresql@16

1️⃣ Clone & Install
bash
Copy code
git clone https://github.com/muthapriyanka/personal-disaster-assistant.git
cd personal-disaster-assistant
npm install

2️⃣ Create Database & Role
bash
Copy code
psql postgres

-- inside psql
CREATE DATABASE pda;
CREATE USER pda_user WITH PASSWORD 'pda_pass';
GRANT ALL PRIVILEGES ON DATABASE pda TO pda_user;
\q

3️⃣ Create .env
Create a .env file in the project root:

env
Copy code
PORT=8000
JWT_SECRET=super-secret-change-me

PGHOST=localhost
PGPORT=5432
PGDATABASE=pda
PGUSER=pda_user
PGPASSWORD=pda_pass

4️⃣ Initialize Schema
bash
Copy code
npm run db:init
npm run db:migrate:hazards
npm run db:migrate:alerts
npm run db:migrate:shelters
If scripts are missing, run directly:
node src/db-init.js
node src/db-migrate-hazards.js
node src/db-migrate-alerts.js
node src/db-migrate-shelters.js

5️⃣ Ingest Live Data
# earthquakes (from USGS)
npm run ingest:usgs

# shelters (from FEMA/NAPSG)
npm run ingest:shelters
Install missing dependency if needed:
npm i node-fetch@2

6️⃣ Start the API
bash
Copy code
npm run dev
# or node src/index.js
Health check:

curl -s http://localhost:8000/health
# → {"ok":true,"ts":"..."}

7️⃣ Register & Login

curl -X POST http://localhost:8000/auth/register \
  -H "content-type: application/json" \
  -d '{"name":"Priyanka","email":"p@example.com","password":"secret"}'

curl -X POST http://localhost:8000/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"p@example.com","password":"secret"}'
Copy the "token" from the login response.

8️⃣ Add a Place

TOKEN=PASTE_JWT_TOKEN
curl -X POST http://localhost:8000/places \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"label":"home","lat":37.3352,"lon":-121.8811}'
List places:

curl -H "authorization: Bearer $TOKEN" http://localhost:8000/places
9️⃣ Generate Alerts (demo job)
bash
Copy code
ALERT_LOOKBACK_MINUTES=720 npm run alerts:run
Fetch your alerts:

curl -H "authorization: Bearer $TOKEN" http://localhost:8000/alerts | jq
🔎 Useful API Calls

# Nearby earthquakes
curl "http://localhost:8000/hazards?lat=37.3352&lon=-121.8811&radius_km=500"

# Nearest shelters (radius=0 disables filter)
curl "http://localhost:8000/shelters?lat=37.3352&lon=-121.8811&radius_km=0&limit=5"

# Combined earthquakes + adaptive shelters
curl "http://localhost:8000/overview?lat=37.3352&lon=-121.8811&radius_km=300&city=San%20Jose"
📜 API Endpoints
Method	Endpoint	Description
POST	/auth/register	Register a user
POST	/auth/login	Login, returns JWT
POST	/places	Add user place
GET	/places	List user places
GET	/hazards	Earthquakes near location
GET	/shelters	Shelters near location
GET	/alerts	User alerts
GET	/overview	Earthquakes + nearest shelters

🗄️ Database Tables
user_account

user_place

hazard, earthquake_event

shelter

alert


Frontend dashboard (React)

