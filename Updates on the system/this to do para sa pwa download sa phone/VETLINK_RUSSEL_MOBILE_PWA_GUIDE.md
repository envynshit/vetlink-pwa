# VetLink PWA — Gabay sa Pag-Access at Pag-Install sa Mobile Phone (Para kay Russel)

**Dokumento:** Step-by-Step Technical Guide for Mobile PWA Installation & Camera Access  
**Inihanda Para kay:** Russel (Lead Developer / UI Team) & Benedict  
**Proyekto:** *VetLink Animal Decision Support System (EARIST Capstone)*  
**Petsa:** October 27, 2026  

---

## 1. Bakit Hindi Ma-Download o Walang Lumalabas na "Install" sa Phone?

Kapag binubuksan ang VetLink sa cellphone gamit ang local Wi-Fi IP address (halimbawa: `http://192.168.1.9:5173/`), nararanasan ang dalawang pangunahing isyu:
1. **Hindi lumalabas ang PWA Install Banner** (o kapag pinindot ang "Install PWA" button, lumalabas lang ang text alert at hindi nag-i-install).
2. **Ayaw gumana ng Camera** sa New Patient page.

### Ang Dahilan (Web Security Standards):
* **Strict HTTPS Requirement:** Ang mga modernong browser tulad ng **Google Chrome (Android)** at **Apple Safari (iOS)** ay may mahigpit na panuntunan: Ang Service Workers, PWA installation (`beforeinstallprompt`), at camera hardware (`getUserMedia`) ay pinapagana **LAMANG sa isang Secure Context (`https://` o `http://localhost`)**.
* Kapag nag-type ka ng `http://192.168.X.X:5173/` sa phone:
  * Ito ay **HTTP** (hindi encrypted).
  * Hindi rin ito `localhost` sa paningin ng phone.
  * Kaya awtomatikong **binablock ng browser engine** ang PWA install prompt at camera access para sa seguridad ng user.

---

## 2. Apat (4) na Solusyon para Ma-Install at Magamit sa Phone

---

### ⭐ SOLUSYON 1 (PINAKAMADALI AT 100% GUMAGANA): Libreng HTTPS Cloudflare Tunnel

Ito ang pinakamabilis at pinaka-propesyonal na paraan dahil binibigyan nito ang VetLink ng **lehitimong HTTPS link** nang libre, walang kailangang bayaran, at walang kailangang baguhin sa phone.

#### Hakbang sa PC:
1. Siguraduhing tumatakbo ang VetLink sa PC (`run_vetlink.bat` o `npm run dev`).
2. Magbukas ng panibagong Terminal o Command Prompt sa PC at i-type ito:
   ```bash
   npx cloudflared tunnel --url http://localhost:5173
   ```
   *(O kung may naka-install kang ngrok: `ngrok http 5173`)*
3. Maghintay ng 5 segundo. May makikita kang link sa terminal na katulad nito:
   ```text
   https://xxxx-xxxx-xxxx.trycloudflare.com
   ```
4. I-copy ang link na iyon at i-send sa messenger o buksan sa browser ng iyong phone.

#### Resulta sa Phone:
* **Android (Chrome):** Dahil tunay itong HTTPS, **agad lalabas sa ilalim ang "Add VetLink to Home Screen" o "Install App"**! Kapag cliniclick ang "Install PWA" button sa sidebar, mag-i-install ito bilang isang tunay na standalone mobile app na may logo ng VetLink sa home screen.
* **Camera Access:** 100% gagana ang live camera sa pagkuha ng sugat ng aso o pusa.
* **iOS (iPhone):** Buksan sa Safari $\to$ Pindutin ang Share button $\to$ Pindutin ang **"Add to Home Screen"**.

---

### 📱 SOLUSYON 2: USB Cable Port Forwarding (Zero Internet / Android Only)

Kung walang internet o mahina ang Wi-Fi at gusto mong subukan ang VetLink sa Android phone gamit ang USB cord:

1. Isaksak ang Android phone sa PC gamit ang USB cable.
2. Sa phone: Pumunta sa **Settings $\to$ Developer Options $\to$ I-ON ang "USB Debugging"**.
3. Sa PC: Buksan ang Google Chrome at pumunta sa link na ito:
   ```text
   chrome://inspect/#devices
   ```
4. I-click ang button na **"Port forwarding..."**.
5. Ilagay ang mga sumusunod:
   * **Port:** `5173`
   * **IP address and port:** `localhost:5173`
   * Lagyan ng check ang **"Enable port forwarding"** at i-click ang **Done**.
6. Sa Phone: Buksan ang Google Chrome at i-type:
   ```text
   http://localhost:5173/
   ```
7. **Bakit ito gagana?** Dahil `localhost` ang tina-type sa phone, kinikilala ito ng Android bilang 100% Secure Context! Agad gagana ang "Install PWA" at camera nang walang HTTPS certificate!

---

### 🌐 SOLUSYON 3: Chrome Flag sa Phone para sa Local Wi-Fi IP (Android)

Kung ayaw mong gumamit ng USB cable o cloudflare tunnel at gusto mong gamitin ang local Wi-Fi IP (`http://192.168.1.9:5173`):

1. Sa Google Chrome ng phone, i-type ito sa URL bar:
   ```text
   chrome://flags/#unsafely-treat-insecure-origin-as-secure
   ```
2. Hanapin ang setting na **"Insecure origins treated as secure"**.
3. Pindutin ang dropdown at piliin ang **"Enabled"**.
4. Sa text box sa ilalim nito, i-type ang buong address ng PC sa Wi-Fi:
   ```text
   http://192.168.1.9:5173
   ```
   *(Palitan ang IP kung iba ang nakalagay sa iyong terminal).*
5. Pindutin ang kulay asul na **"Relaunch"** button sa ibaba ng Chrome.
6. Buksan ulit ang `http://192.168.1.9:5173/` sa phone.
7. Papayagan na ngayon ng Chrome ang pag-install ng PWA at pag-access sa camera sa IP na iyan!

---

### 🍏 SOLUSYON 4: Para sa mga Gumagamit ng iPhone / iPad (iOS Safari)

Hindi sumusuporta ang Apple Safari sa awtomatikong pop-up install banner tulad ng Android. Sa iPhone, ganito ang tamang paraan:

1. Buksan ang VetLink link sa **Safari browser** (huwag sa Chrome ng iOS dahil Safari lang ang pinapayagan ng Apple na mag-install ng PWA sa home screen).
2. Pindutin ang **Share button** sa ilalim ng screen (parisukat na may arrow na nakaturo pataas).
3. Mag-scroll pababa sa listahan ng options at hanapin ang **"Add to Home Screen"** (`Idagdag sa Home Screen`).
4. Pindutin ang **"Add"** sa kanang itaas.
5. Lalabas na ang VetLink icon sa iyong iPhone Home Screen. Kapag binuksan mo ito, magbubukas ito bilang full-screen standalone application na walang Safari URL bar!

---

## 3. Quick Checklist para kay Russel

| Gagawin | Status | Paalala |
| :--- | :---: | :--- |
| **Vite Host Binding** | ✅ **Naka-ayos na** | Naidagdag na natin ang `host: true` sa `vite.config.js` para pumasok ang koneksyon mula sa Wi-Fi. |
| **PWA Event Listener** | ✅ **Naka-ayos na** | Ang `beforeinstallprompt` at `handleInstallClick` ay naka-wire na sa `src/App.jsx`. |
| **Pag-test sa Phone** | 🚀 **Pumili ng Solusyon** | Patakbuhin ang `npx cloudflared tunnel --url http://localhost:5173` para sa instant HTTPS testing. |
