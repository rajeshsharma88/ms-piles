document.addEventListener('DOMContentLoaded', () => {
  // Modal Elements
  const modal = document.getElementById('orderModal');
  const modalForm = document.getElementById('orderForm');
  const modalFormView = document.getElementById('modalFormView');
  const modalSuccessView = document.getElementById('modalSuccessView');
  const custNameInput = document.getElementById('custName');
  const custPhoneInput = document.getElementById('custPhone');
  const formErrorAlert = document.getElementById('formErrorAlert');
  const formSubmitBtn = document.getElementById('formSubmitBtn');
  const otpSection = document.getElementById('otpVerificationSection');
  const otpInput = document.getElementById('custOtp');
  const otpStatus = document.getElementById('otpStatus');
  const otpResendBtn = document.getElementById('otpResendBtn');
  const changePhoneBtn = document.getElementById('changePhoneBtn');
  const otpBridgeForm = document.getElementById('otpBridgeForm');
  const otpBridgeFrame = document.getElementById('otpTransportFrame');
  const otpWebAppUrl = 'https://script.google.com/macros/s/AKfycbzMVWxT84RjE4OHNzbJey66D4q-I9d54JP1Vv4-S788Zg8hWfINrRhPTOZIj4Ppk6CrmA/exec';
  let otpSent = false;
  let otpResendTimer;

  // Success view fields
  const successCustomerName = document.getElementById('successCustomerName');
  const successCustomerPhone = document.getElementById('successCustomerPhone');

  // Open Modal Functions
  window.openOrderModal = function () {
    if (modal) {
      modal.classList.add('show');
      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
  };

  // Close Modal Functions
  window.closeOrderModal = function () {
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
      document.body.style.overflow = '';
      
      // Reset form after short delay
      setTimeout(() => {
        if (modalForm) modalForm.reset();
        if (modalFormView) modalFormView.style.display = 'block';
        if (modalSuccessView) modalSuccessView.style.display = 'none';
        otpSent = false;
        if (otpSection) otpSection.hidden = true;
        if (otpInput) otpInput.value = '';
        if (custNameInput) custNameInput.readOnly = false;
        if (custPhoneInput) custPhoneInput.readOnly = false;
        if (otpStatus) {
          otpStatus.hidden = true;
          otpStatus.textContent = '';
        }
        if (otpResendTimer) clearInterval(otpResendTimer);
        if (otpResendBtn) {
          otpResendBtn.disabled = false;
          otpResendBtn.textContent = 'OTP फिर से भेजें';
        }
        if (formErrorAlert) {
          formErrorAlert.style.display = 'none';
          formErrorAlert.textContent = '';
        }
        if (formSubmitBtn) {
          formSubmitBtn.disabled = false;
          formSubmitBtn.innerHTML = '<i class="bi bi-whatsapp me-1"></i> WhatsApp पर OTP भेजें';
        }
      }, 300);
    }
  };

  // Attach modal trigger to all CTA buttons
  const modalTriggers = document.querySelectorAll('.open-order-modal, [data-open-modal]');
  modalTriggers.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openOrderModal();
    });
  });

  // Close modal on backdrop click
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeOrderModal();
      }
    });
  }

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
      closeOrderModal();
    }
  });

  // Phone input formatting (numbers only, max 10 digits)
  if (custPhoneInput) {
    custPhoneInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      if (formErrorAlert) formErrorAlert.style.display = 'none';
    });
  }

  if (custNameInput) {
    custNameInput.addEventListener('input', () => {
      if (formErrorAlert) formErrorAlert.style.display = 'none';
    });
  }

  if (otpInput) {
    otpInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      if (formErrorAlert) formErrorAlert.style.display = 'none';
    });
  }

  function submitOtpRequest(action, values) {
    return new Promise((resolve, reject) => {
      if (!otpBridgeForm || !otpBridgeFrame) {
        reject(new Error('OTP service is not configured.'));
        return;
      }

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const fields = {
        action,
        requestId,
        name: values.name || '',
        phone: values.phone || '',
        otp: values.otp || ''
      };
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        reject(new Error('जवाब मिलने में समय लग रहा है। कृपया फिर से प्रयास करें।'));
      }, 30000);

      function handleResponse(event) {
        if (event.source !== otpBridgeFrame.contentWindow || !event.data ||
            event.data.source !== 'piles-otp-backend' || event.data.requestId !== requestId) {
          return;
        }

        clearTimeout(timeout);
        window.removeEventListener('message', handleResponse);
        if (event.data.ok) {
          resolve(event.data);
        } else {
          reject(new Error(event.data.message || 'OTP अनुरोध पूरा नहीं हो पाया।'));
        }
      }

      window.addEventListener('message', handleResponse);
      Object.entries(fields).forEach(([name, value]) => {
        const input = otpBridgeForm.elements.namedItem(name);
        if (input) input.value = value;
      });
      otpBridgeForm.action = otpWebAppUrl;
      otpBridgeForm.submit();
    });
  }

  function setResendCooldown(seconds = 60) {
    if (!otpResendBtn) return;
    if (otpResendTimer) clearInterval(otpResendTimer);

    let remaining = seconds;
    otpResendBtn.disabled = true;
    otpResendBtn.textContent = `फिर से भेजें (${remaining}s)`;
    otpResendTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(otpResendTimer);
        otpResendBtn.disabled = false;
        otpResendBtn.textContent = 'OTP फिर से भेजें';
      } else {
        otpResendBtn.textContent = `फिर से भेजें (${remaining}s)`;
      }
    }, 1000);
  }

  async function requestOtp(name, phone, button) {
    if (button) {
      button.disabled = true;
      button.dataset.previousText = button.textContent;
      button.textContent = 'WhatsApp OTP भेजा जा रहा है...';
    }
    if (formErrorAlert) formErrorAlert.style.display = 'none';

    try {
      await submitOtpRequest('sendOtp', { name, phone });
      otpSent = true;
      if (otpSection) otpSection.hidden = false;
      if (custNameInput) custNameInput.readOnly = true;
      if (custPhoneInput) custPhoneInput.readOnly = true;
      if (otpStatus) {
        otpStatus.textContent = 'WhatsApp पर OTP भेज दिया गया है। यह 5 मिनट तक मान्य रहेगा।';
        otpStatus.hidden = false;
      }
      setResendCooldown();
      if (formSubmitBtn) {
        formSubmitBtn.disabled = false;
        formSubmitBtn.innerHTML = '<i class="bi bi-shield-check me-1"></i> OTP सत्यापित करें और आगे बढ़ें';
      }
      if (otpInput) otpInput.focus();
    } catch (err) {
      showError(err.message || 'OTP भेजा नहीं जा सका। कृपया फिर से प्रयास करें।');
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.previousText || 'OTP फिर से भेजें';
      }
    }
  }

  if (otpResendBtn) {
    otpResendBtn.addEventListener('click', () => {
      requestOtp(custNameInput.value.trim(), custPhoneInput.value.trim(), otpResendBtn);
    });
  }

  if (changePhoneBtn) {
    changePhoneBtn.addEventListener('click', () => {
      otpSent = false;
      if (otpSection) otpSection.hidden = true;
      if (otpInput) otpInput.value = '';
      if (custNameInput) custNameInput.readOnly = false;
      if (custPhoneInput) custPhoneInput.readOnly = false;
      if (otpStatus) otpStatus.hidden = true;
      if (otpResendTimer) clearInterval(otpResendTimer);
      if (formSubmitBtn) {
        formSubmitBtn.innerHTML = '<i class="bi bi-whatsapp me-1"></i> WhatsApp पर OTP भेजें';
      }
      if (custPhoneInput) custPhoneInput.focus();
    });
  }

  // Handle Form Submission
  if (modalForm) {
    modalForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = custNameInput ? custNameInput.value.trim() : '';
      const phone = custPhoneInput ? custPhoneInput.value.trim() : '';

      if (!name) {
        showError('कृपया अपना पूरा नाम दर्ज करें।');
        return;
      }

      if (phone.length !== 10) {
        showError('कृपया 10 अंकों का सही मोबाइल नंबर दर्ज करें।');
        return;
      }

      if (!otpSent) {
        await requestOtp(name, phone, formSubmitBtn);
        return;
      }

      const otp = otpInput ? otpInput.value.trim() : '';
      if (!/^\d{6}$/.test(otp)) {
        showError('कृपया WhatsApp पर भेजा गया 6 अंकों का OTP दर्ज करें।');
        return;
      }

      // Show Loading State
      if (formSubmitBtn) {
        formSubmitBtn.disabled = true;
        formSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>OTP जाँचा जा रहा है...';
      }

      try {
        await submitOtpRequest('verifyOtp', { name, phone, otp });

        const payload = {
          event_name: 'Contact',
          name: name,
          phone: phone,
          product: 'Aarogya India 3A Piles Kit',
          submittedAt: new Date().toISOString()
        };

        fetch('https://mpc2-prod-29-is5qnl632q-uc.a.run.app/events?cee=no', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch((err) => console.warn('Analytics tracking error:', err));
      } catch (err) {
        console.warn('OTP verification error:', err);
        showError(err.message || 'OTP सत्यापित नहीं हो पाया। कृपया दोबारा प्रयास करें।');
        if (formSubmitBtn) {
          formSubmitBtn.disabled = false;
          formSubmitBtn.innerHTML = '<i class="bi bi-shield-check me-1"></i> OTP सत्यापित करें और आगे बढ़ें';
        }
        return;
      }

      sessionStorage.setItem('customer_name', name);
      sessionStorage.setItem('customer_phone', phone);
      window.location.href = 'thankyou.html';
    });
  }

  function showError(msg) {
    if (formErrorAlert) {
      formErrorAlert.innerHTML = `<i class="bi bi-exclamation-circle-fill me-1"></i> ${msg}`;
      formErrorAlert.style.display = 'block';
    }
    if (otpStatus) otpStatus.hidden = true;
  }

  // FAQ Accordion Toggle
  const faqButtons = document.querySelectorAll('.faq-accordion .accordion-button');
  faqButtons.forEach(button => {
    button.addEventListener('click', () => {
      const isCollapsed = button.classList.contains('collapsed');
      const targetCollapse = button.closest('.accordion-item').querySelector('.accordion-collapse');

      // Close all first
      faqButtons.forEach(btn => {
        btn.classList.add('collapsed');
        const collapse = btn.closest('.accordion-item').querySelector('.accordion-collapse');
        if (collapse) {
          collapse.classList.remove('show');
        }
      });

      // If it was collapsed, open it
      if (isCollapsed) {
        button.classList.remove('collapsed');
        if (targetCollapse) {
          targetCollapse.classList.add('show');
        }
      }
    });
  });

  // Testimonials Carousel Logic
  const testimonialTrack = document.getElementById('testimonialsTrack');
  const prevBtn = document.getElementById('tPrevBtn');
  const nextBtn = document.getElementById('tNextBtn');

  if (testimonialTrack) {
    const scrollAmount = 350;

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        testimonialTrack.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        testimonialTrack.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      });
    }

    // Auto scroll every 4.5s
    setInterval(() => {
      if (testimonialTrack.scrollLeft + testimonialTrack.clientWidth >= testimonialTrack.scrollWidth - 20) {
        testimonialTrack.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        testimonialTrack.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }, 4500);
  }
});
