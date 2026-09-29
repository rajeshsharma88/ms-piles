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
  const leadBridgeForm = document.getElementById('leadBridgeForm');
  const leadBridgeFrame = document.getElementById('leadTransportFrame');
  const leadWebAppUrl = 'https://script.google.com/macros/s/AKfycbx1bDI4lkCauBnZ9Y5e7WsKsWqu3WsPtdoz8qHfFauxcxrLFtD5iBv23Stq4vwi1JD8ow/exec';

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
        if (formErrorAlert) {
          formErrorAlert.style.display = 'none';
          formErrorAlert.textContent = '';
        }
        if (formSubmitBtn) {
          formSubmitBtn.disabled = false;
          formSubmitBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i> ऑर्डर बुक करें';
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

  function submitLeadRequest(values) {
    return new Promise((resolve, reject) => {
      if (!leadBridgeForm || !leadBridgeFrame) {
        reject(new Error('Lead service is not configured.'));
        return;
      }

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const fields = {
        action: 'submitLead',
        requestId,
        name: values.name || '',
        phone: values.phone || ''
      };
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        reject(new Error('जवाब मिलने में समय लग रहा है। कृपया फिर से प्रयास करें।'));
      }, 30000);

      function handleResponse(event) {
        const origin = event.origin;
        const hostname = origin.startsWith('https://') ? new URL(origin).hostname : '';
        const trustedOrigin = origin === 'https://script.google.com' ||
          hostname === 'script.googleusercontent.com' || /[-.]script\.googleusercontent\.com$/.test(hostname);
        if (!trustedOrigin || !event.data ||
            event.data.source !== 'piles-lead-backend' || event.data.requestId !== requestId) {
          return;
        }

        clearTimeout(timeout);
        window.removeEventListener('message', handleResponse);
        if (event.data.ok) {
          resolve(event.data);
        } else {
          reject(new Error(event.data.message || 'अनुरोध पूरा नहीं हो पाया।'));
        }
      }

      window.addEventListener('message', handleResponse);
      Object.entries(fields).forEach(([name, value]) => {
        const input = leadBridgeForm.elements.namedItem(name);
        if (input) input.value = value;
      });
      leadBridgeForm.action = leadWebAppUrl;
      leadBridgeForm.submit();
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

      // Show Loading State
      if (formSubmitBtn) {
        formSubmitBtn.disabled = true;
        formSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>बुकिंग की जा रही है...';
      }

      try {
        await submitLeadRequest({ name, phone });

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
        console.warn('Lead submission error:', err);
        showError(err.message || 'बुकिंग सबमिट नहीं हो पाई। कृपया दोबारा प्रयास करें।');
        if (formSubmitBtn) {
          formSubmitBtn.disabled = false;
          formSubmitBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i> ऑर्डर बुक करें';
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
