(function () {
  'use strict';

  var root = document.documentElement;
  var intro = document.querySelector('[data-salon-intro]');
  var skip = intro && intro.querySelector('[data-intro-skip]');
  var pending = root.classList.contains('salon-intro-pending');
  var state = pending ? 'idle' : 'finished';
  var timers = [];
  var inerted = [];
  var focusMainAfterFinish = false;

  function clearTimers() {
    while (timers.length) window.clearTimeout(timers.pop());
    if (window.__salonIntroFailsafe) {
      window.clearTimeout(window.__salonIntroFailsafe);
      window.__salonIntroFailsafe = 0;
    }
  }

  function releasePage() {
    inerted.forEach(function (node) {
      node.removeAttribute('inert');
      node.removeAttribute('data-intro-inert');
    });
    inerted = [];
  }

  function finish(immediate) {
    if (state === 'finished') return;
    state = 'finished';
    clearTimers();
    releasePage();
    root.classList.remove('salon-intro-pending', 'salon-intro-running', 'salon-intro-leaving');
    if (intro && intro.parentNode) intro.parentNode.removeChild(intro);

    if (!immediate && focusMainAfterFinish) {
      var main = document.getElementById('main');
      if (main && typeof main.focus === 'function') main.focus({ preventScroll:true });
    }
    removeListeners();
  }

  function leave(immediate) {
    if (state === 'finished' || state === 'leaving') return;
    state = 'leaving';
    if (immediate) {
      finish(true);
      return;
    }
    root.classList.add('salon-intro-leaving');
    timers.push(window.setTimeout(function () { finish(false); }, 940));
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      leave(true);
    }
  }

  function onSkip(event) {
    focusMainAfterFinish = event.detail === 0;
    leave(false);
  }

  function onBackdrop(event) {
    if (event.target === intro || event.target.classList.contains('salon-intro__sheet')) {
      leave(false);
    }
  }

  function onPageHide() {
    finish(true);
  }

  function onPageShow(event) {
    if (event.persisted) finish(true);
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') finish(true);
  }

  function onMotionChange(event) {
    if (!event.matches) return;
    finish(true);
  }

  function removeListeners() {
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    if (skip) skip.removeEventListener('click', onSkip);
    if (intro) intro.removeEventListener('click', onBackdrop);
    if (motionQuery && motionQuery.removeEventListener) {
      motionQuery.removeEventListener('change', onMotionChange);
    }
  }

  var motionQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  window.__salonIntroFinish = finish;

  if (!intro || !pending) {
    if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
    clearTimers();
    return;
  }

  Array.prototype.forEach.call(document.body.children, function (node) {
    if (node === intro || node.tagName === 'SCRIPT' || node.hasAttribute('inert')) return;
    node.setAttribute('inert', '');
    node.setAttribute('data-intro-inert', '1');
    inerted.push(node);
  });

  document.addEventListener('keydown', onKeydown);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  if (skip) skip.addEventListener('click', onSkip);
  intro.addEventListener('click', onBackdrop);
  if (motionQuery && motionQuery.addEventListener) {
    motionQuery.addEventListener('change', onMotionChange);
  }

  state = 'running';
  window.requestAnimationFrame(function () {
    window.requestAnimationFrame(function () {
      if (state === 'running') root.classList.add('salon-intro-running');
    });
  });

  timers.push(window.setTimeout(function () { leave(false); }, 2500));
}());
