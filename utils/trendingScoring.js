function computeWeightedEngagement(type, deltas) {
  const { viewsDelta = 0, likesDelta = 0, commentsDelta = 0, sharesDelta = 0, answersDelta = 0, votesDelta = 0 } = deltas || {};
  if (type === 'blog') {
    const w = { view: 1, like: 6, comment: 10, share: 12 };
    return (
      w.view * viewsDelta +
      w.like * likesDelta +
      w.comment * commentsDelta +
      w.share * sharesDelta
    );
  }
  if (type === 'question') {
    const w = { view: 1, answer: 12 };
    return w.view * viewsDelta + w.answer * answersDelta;
  }
  if (type === 'poll') {
    const w = { view: 1, vote: 8 };
    return w.view * viewsDelta + w.vote * votesDelta;
  }
  return 0;
}

function scoreWithAge(weightedEngagement, ageHours) {
  const denom = Math.sqrt(1 + Math.max(0, Number(ageHours) || 0));
  return (Number(weightedEngagement) || 0) / denom;
}

module.exports = { computeWeightedEngagement, scoreWithAge };


