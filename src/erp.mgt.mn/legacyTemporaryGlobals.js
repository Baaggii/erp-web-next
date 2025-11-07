if (typeof window !== 'undefined') {
  const ensureGlobalTemporaryHelper = (name) => {
    if (typeof window[name] !== 'function') {
      window[name] = () => {};
    }
  };

  ensureGlobalTemporaryHelper('showTemporaryRequesterUI');
  ensureGlobalTemporaryHelper('showTemporaryReviewerUI');
  ensureGlobalTemporaryHelper('showTemporaryTransactionsUI');
}
