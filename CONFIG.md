# Analysis Worker - Configuration Guide

## 📋 Overview

Analysis Worker menggunakan **centralized configuration** yang diatur di root `.env` file (`/atma-backend/.env`). Tidak ada konfigurasi lokal yang di-hardcode atau tersebar di berbagai tempat.

## 🎯 Single Source of Truth

**SEMUA konfigurasi AI model harus diatur di:**
```
/atma-backend/.env
```

**JANGAN** mengatur konfigurasi di:
- ❌ `/analysis-worker/.env` (tidak ada file ini)
- ❌ `/analysis-worker/.env.docker` (sudah di-rename ke .backup)
- ❌ Hardcoded di source code
- ❌ Override di docker-compose files

## 🔧 Konfigurasi AI Model

### Required Environment Variables

Di file `/atma-backend/.env`, set variabel berikut:

```bash
# Google AI API Key
GOOGLE_AI_API_KEY=your_api_key_here

# Model Selection (pilih salah satu)
GOOGLE_AI_MODEL=gemini-2.5-pro      # Untuk kualitas terbaik
# GOOGLE_AI_MODEL=gemini-2.5-flash  # Untuk speed dan efisiensi

# Temperature (0.0 - 1.0)
AI_TEMPERATURE=0.2                  # Lower = lebih konsisten, Higher = lebih kreatif

# Mock Model (untuk testing tanpa API calls)
USE_MOCK_MODEL=false                # true = mock, false = real API
```

## 🔄 Cara Mengganti Konfigurasi

### 1. Edit Root .env File

```bash
# Edit file
nano /home/rayin/Desktop/atma-backend/.env

# Atau dengan editor favorit
code /home/rayin/Desktop/atma-backend/.env
```

### 2. Ubah Nilai yang Diinginkan

Contoh mengganti model dari pro ke flash:
```bash
# Sebelum
GOOGLE_AI_MODEL=gemini-2.5-pro

# Sesudah
GOOGLE_AI_MODEL=gemini-2.5-flash
```

Contoh mengaktifkan mock model:
```bash
# Sebelum
USE_MOCK_MODEL=false

# Sesudah
USE_MOCK_MODEL=true
```

### 3. Restart Container

```bash
# Restart analysis-worker saja
docker-compose restart analysis-worker

# Atau restart semua services
docker-compose restart
```

### 4. Verifikasi Perubahan

Cek logs untuk memastikan konfigurasi baru ter-load:

```bash
# Lihat logs
docker-compose logs -f analysis-worker

# Cari baris seperti ini:
# "AI Configuration loaded from environment: { model: 'gemini-2.5-flash', temperature: 0.2, useMockModel: false }"
```

## 🧪 Testing Konfigurasi

### Test 1: Ganti Model (Pro ↔ Flash)

```bash
# 1. Edit .env
sed -i 's/GOOGLE_AI_MODEL=gemini-2.5-pro/GOOGLE_AI_MODEL=gemini-2.5-flash/' .env

# 2. Restart
docker-compose restart analysis-worker

# 3. Cek logs
docker-compose logs analysis-worker | grep "AI Configuration"

# 4. Kembalikan
sed -i 's/GOOGLE_AI_MODEL=gemini-2.5-flash/GOOGLE_AI_MODEL=gemini-2.5-pro/' .env
docker-compose restart analysis-worker
```

### Test 2: Toggle Mock Model

```bash
# 1. Aktifkan mock
sed -i 's/USE_MOCK_MODEL=false/USE_MOCK_MODEL=true/' .env
docker-compose restart analysis-worker

# 2. Cek logs - seharusnya ada "useMockModel: true"
docker-compose logs analysis-worker | grep "useMockModel"

# 3. Nonaktifkan mock
sed -i 's/USE_MOCK_MODEL=true/USE_MOCK_MODEL=false/' .env
docker-compose restart analysis-worker
```

### Test 3: Ubah Temperature

```bash
# 1. Ubah temperature
sed -i 's/AI_TEMPERATURE=0.2/AI_TEMPERATURE=0.7/' .env
docker-compose restart analysis-worker

# 2. Cek logs
docker-compose logs analysis-worker | grep "temperature"

# 3. Kembalikan
sed -i 's/AI_TEMPERATURE=0.7/AI_TEMPERATURE=0.2/' .env
docker-compose restart analysis-worker
```

## 🔍 Troubleshooting

### Problem: Konfigurasi tidak berubah setelah restart

**Solusi:**
1. Pastikan edit file `.env` yang benar (di root `/atma-backend/.env`)
2. Cek tidak ada typo di nama variabel
3. Restart dengan `docker-compose down` lalu `docker-compose up -d`
4. Cek logs untuk error messages

### Problem: Error "Missing required environment variables"

**Solusi:**
1. Pastikan semua variabel required ada di `.env`:
   - GOOGLE_AI_API_KEY
   - GOOGLE_AI_MODEL
   - AI_TEMPERATURE
   - USE_MOCK_MODEL
2. Pastikan tidak ada spasi di sekitar `=`
3. Pastikan nilai tidak kosong

### Problem: Container tidak mau start

**Solusi:**
```bash
# 1. Cek logs detail
docker-compose logs analysis-worker

# 2. Cek environment variables di container
docker-compose exec analysis-worker env | grep GOOGLE

# 3. Rebuild container
docker-compose build analysis-worker
docker-compose up -d analysis-worker
```

## 📊 Validation

Worker akan melakukan validasi saat startup:

1. **Environment Validation** - Cek semua required variables ada
2. **AI Config Validation** - Cek model name dan temperature valid
3. **Startup Logs** - Print konfigurasi yang ter-load

Jika ada masalah, worker akan **FAIL FAST** dengan error message yang jelas.

## 🎓 Best Practices

1. ✅ **Selalu edit root .env file**
2. ✅ **Restart container setelah perubahan**
3. ✅ **Cek logs untuk verifikasi**
4. ✅ **Test dengan mock model dulu sebelum production**
5. ✅ **Backup .env sebelum perubahan besar**

## 📝 File Structure

```
atma-backend/
├── .env                          # ✅ EDIT DI SINI
├── docker-compose.yml            # Production defaults
├── docker-compose.override.yml   # Development overrides
└── analysis-worker/
    ├── .env.example              # Template & dokumentasi
    ├── .env.docker.backup        # Old config (deprecated)
    ├── CONFIG.md                 # File ini
    └── src/
        ├── config/
        │   └── ai.js             # Load config dari env (no fallbacks)
        └── worker.js             # Validate env on startup
```

## 🚀 Quick Reference

| Action | Command |
|--------|---------|
| Edit config | `nano .env` |
| Restart worker | `docker-compose restart analysis-worker` |
| View logs | `docker-compose logs -f analysis-worker` |
| Check env vars | `docker-compose exec analysis-worker env \| grep GOOGLE` |
| Test mock mode | Set `USE_MOCK_MODEL=true` in `.env` |
| Switch to Flash | Set `GOOGLE_AI_MODEL=gemini-2.5-flash` in `.env` |
| Switch to Pro | Set `GOOGLE_AI_MODEL=gemini-2.5-pro` in `.env` |

## 🔐 Security Notes

- `.env` file contains sensitive API keys
- Never commit `.env` to git (already in .gitignore)
- Use `.env.example` as template for new environments
- Rotate API keys regularly

