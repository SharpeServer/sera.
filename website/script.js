/* SERA — website script */

// ─── Configuration ─────────────────────────────────────────
// Replace this with your actual SERA WhatsApp number (no +, no spaces)
const SERA_WHATSAPP_NUMBER = 'YOUR_WHATSAPP_NUMBER_HERE';
const SERA_WELCOME_MESSAGE = encodeURIComponent('Hello SERA');

// ─── WhatsApp CTA Links ─────────────────────────────────────
function buildWhatsAppURL() {
  const number = SERA_WHATSAPP_NUMBER.replace(/\D/g, '');
  if (!number || number === 'YOURWHATSAPPNUMBERHERE') {
    return '#'; // Fallback if not configured
  }
  return `https://wa.me/${number}?text=${SERA_WELCOME_MESSAGE}`;
}

function initCTAButtons() {
  const url = buildWhatsAppURL();
  const buttons = document.querySelectorAll('#whatsapp-cta, #whatsapp-cta-2');
  buttons.forEach((btn) => {
    if (url !== '#') {
      btn.href = url;
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
    } else {
      // Not configured
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        console.warn('[SERA] WhatsApp number not configured in script.js');
        alert('SERA WhatsApp number not configured. Update SERA_WHATSAPP_NUMBER in website/script.js.');
      });
    }
  });
}

// ─── Chat Demo Animation ──────────────────────────────────
function initChatDemo() {
  const typingMsg = document.getElementById('typing-msg');
  const finalMsg = document.getElementById('final-msg');

  if (!typingMsg || !finalMsg) return;

  // After 3 seconds, replace typing indicator with the result
  setTimeout(() => {
    if (typingMsg) typingMsg.style.display = 'none';
    if (finalMsg) {
      finalMsg.style.display = '';
      finalMsg.style.animation = 'fadeIn 0.4s ease';
    }

    // After 5 more seconds, restart the demo
    setTimeout(() => {
      if (typingMsg) {
        typingMsg.style.display = '';
        finalMsg.style.display = 'none';
        // Reset dot animation
        const dots = typingMsg.querySelectorAll('.dot');
        dots.forEach(d => {
          d.style.animation = 'none';
          void d.offsetWidth; // trigger reflow
          d.style.animation = '';
        });
      }
      // Loop
      setTimeout(initChatDemo, 500);
    }, 5000);
  }, 3000);
}

// ─── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCTAButtons();
  initChatDemo();
});
