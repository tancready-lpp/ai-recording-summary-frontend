const BACKEND_URL = "https://meeting-automation-backend-nmwt.onrender.com/workflow";

const config = window.configAPI.loadConfig();
const BACKEND_URL = config.backend_url;

if (!BACKEND_URL) {
  alert("Backend URL not configured. Add it to ~/AIRecordingSummary/config.json");
}


let mediaRecorder = null;
let chunks = [];

const recordBtn = document.getElementById("recordBtn");
const statusEl = document.getElementById("status");
const meetingTitleInput = document.getElementById("meetingTitle");
const meetingDateInput = document.getElementById("meetingDate");
const recipientsInput = document.getElementById("recipients");
const resultsBox = document.getElementById("results");
const resultContent = document.getElementById("resultContent");

// Default date = today
const today = new Date().toISOString().slice(0, 10);
meetingDateInput.value = today;

function setStatus(text, type = "normal") {
  statusEl.textContent = "";
  statusEl.className = "status";
  if (type === "error") {
    statusEl.classList.add("error");
  } else if (type === "processing") {
    statusEl.classList.add("processing");
  }
  const dot = document.createElement("span");
  dot.className = "dot";
  statusEl.appendChild(dot);
  const spanText = document.createTextNode(" " + text);
  statusEl.appendChild(spanText);
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

recordBtn.addEventListener("click", async () => {
  if (!BACKEND_URL || BACKEND_URL.includes("YOUR-BACKEND-URL")) {
    setStatus("Backend URL not configured. Ask your admin to set it in renderer.js.", "error");
    return;
  }

  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
    } catch (err) {
      console.error(err);
      setStatus("Cannot access microphone. Check macOS permissions.", "error");
      return;
    }

    chunks = [];
    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      try {
        setStatus("Encoding audio...", "processing");
        const blob = new Blob(chunks, { type: "audio/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const base64Audio = arrayBufferToBase64(arrayBuffer);

        const title = meetingTitleInput.value.trim() || "Untitled meeting";
        const date = meetingDateInput.value || today;
        const recipientsRaw = recipientsInput.value.trim();
        const recipients = recipientsRaw
          ? recipientsRaw.split(",").map(r => r.trim()).filter(r => r.length > 0)
          : [];

        if (recipients.length === 0) {
          setStatus("Please enter at least one email recipient.", "error");
          recordBtn.disabled = false;
          recordBtn.classList.remove("recording");
          recordBtn.textContent = "🎤 Record";
          return;
        }

        setStatus("Uploading audio & running AI workflow...", "processing");

        const resp = await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_base64: base64Audio,
            meeting_title: title,
            meeting_date: date,
            recipients: recipients
          })
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error("Backend error: " + text);
        }

        const data = await resp.json();

        resultsBox.style.display = "block";
        const docUrl = data.google_doc_url || "";
        let html = "";

        if (docUrl) {
          html += `<p>📄 <strong>Google Doc:</strong> <a href="${docUrl}" target="_blank" rel="noopener noreferrer">${docUrl}</a></p>`;
        }

        if (Array.isArray(data.action_items) && data.action_items.length > 0) {
          html += "<p><strong>Action items:</strong></p><ul>";
          for (const item of data.action_items) {
            html += `<li>${item}</li>`;
          }
          html += "</ul>";
        }

        if (data.transcript_preview) {
          html += "<p><strong>Transcript preview:</strong></p>";
          html += `<pre><code>${data.transcript_preview
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</code></pre>`;
        }

        if (!html) {
          html = "<p>No additional data returned from backend.</p>";
        }

        resultContent.innerHTML = html;
        setStatus("Workflow completed successfully ✅");
      } catch (err) {
        console.error(err);
        setStatus("Error: " + (err.message || err.toString()), "error");
      } finally {
        recordBtn.disabled = false;
        recordBtn.classList.remove("recording");
        recordBtn.textContent = "🎤 Record";
      }
    };

    mediaRecorder.start();
    recordBtn.classList.add("recording");
    recordBtn.textContent = "🛑 Stop";
    setStatus("Recording... click again to stop.");
  } else {
    recordBtn.disabled = true;
    setStatus("Stopping recording...", "processing");
    mediaRecorder.stop();
  }
});
