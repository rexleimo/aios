(() => {
  const root = document.querySelector('[data-rex-blog-index]');
  if (!root) {
    return;
  }

  const postsNode = root.querySelector('[data-rex-blog-posts]');
  const copyNode = root.querySelector('[data-rex-blog-copy]');
  if (!postsNode || !copyNode) {
    return;
  }

  const posts = JSON.parse(postsNode.textContent || '[]');
  const copy = JSON.parse(copyNode.textContent || '{}');
  const pageSize = Number(root.dataset.pageSize || '6');
  const featuredRegion = root.querySelector('[data-rex-blog-featured]');
  const pillsRegion = root.querySelector('[data-rex-blog-pills]');
  const gridRegion = root.querySelector('[data-rex-blog-grid]');
  const sortButton = root.querySelector('[data-rex-blog-sort]');
  const loadMoreButton = root.querySelector('[data-rex-blog-load-more]');
  const countNode = root.querySelector('[data-rex-blog-count]');
  const emptyNode = root.querySelector('[data-rex-blog-empty]');
  const pageNode = root.querySelector('[data-rex-blog-page-indicator]');
  const pillButtons = pillsRegion ? [...pillsRegion.querySelectorAll('[data-tag]')] : [];

  const state = {
    activeTag: 'all',
    sort: 'newest',
    visibleCount: pageSize,
  };

  const normalizeTag = (value) => String(value || '').trim().toLowerCase();
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const comparePosts = (left, right) => {
    if (state.sort === 'oldest') {
      return (left.date_sort || 0) - (right.date_sort || 0);
    }
    return (right.date_sort || 0) - (left.date_sort || 0);
  };

  const getFilteredPosts = () => posts
    .filter((post) => {
      if (state.activeTag === 'all') {
        return true;
      }
      return (post.tags || []).some((tag) => normalizeTag(tag) === state.activeTag);
    })
    .slice()
    .sort(comparePosts);

  const articleCountLabel = (count) => `${count} ${copy.articles_suffix || 'articles'}`;

  const renderFeatured = (filteredPosts) => {
    if (!featuredRegion) {
      return;
    }

    const featured = filteredPosts[0];
    if (!featured) {
      featuredRegion.hidden = true;
      featuredRegion.innerHTML = '';
      return;
    }

    featuredRegion.hidden = false;
    featuredRegion.innerHTML = `
      <a class="rex-blog-featured__media ${escapeHtml(featured.theme_class)}" href="${escapeHtml(featured.url)}">
        <span class="rex-blog-featured__badge">${escapeHtml(copy.featured_badge || 'FEATURED')}</span>
        <span class="rex-blog-featured__icon" data-icon="${escapeHtml(featured.icon)}"></span>
      </a>
      <div class="rex-blog-featured__body">
        <div class="rex-blog-meta"><span>${escapeHtml(featured.category)}</span><small>${escapeHtml(featured.read_time_label)}</small></div>
        <h2><a href="${escapeHtml(featured.url)}">${escapeHtml(featured.title)}</a></h2>
        <p>${escapeHtml(featured.description)}</p>
        <div class="rex-blog-author"><span>${escapeHtml(featured.initials)}</span><strong>${escapeHtml(featured.author)}</strong><small>${escapeHtml(featured.date_label)}</small></div>
      </div>
    `;
  };

  const renderPostCards = (filteredPosts) => {
    if (!gridRegion) {
      return;
    }

    const cards = filteredPosts.slice(1, 1 + state.visibleCount);
    gridRegion.innerHTML = cards.map((post) => `
      <a class="rex-blog-card ${escapeHtml(post.theme_class)}" href="${escapeHtml(post.url)}">
        <span class="rex-blog-card__thumb"><span data-icon="${escapeHtml(post.icon)}"></span></span>
        <span class="rex-blog-card__meta"><strong>${escapeHtml(post.category)}</strong><span>${escapeHtml(post.read_time_label)}</span></span>
        <span class="rex-blog-card__title">${escapeHtml(post.title)}</span>
        <span class="rex-blog-card__desc">${escapeHtml(post.description)}</span>
        <span class="rex-blog-card__footer"><span>${escapeHtml(post.author)}</span><small>${escapeHtml(post.date_label)}</small></span>
      </a>
    `).join('');

    const hasCards = cards.length > 0;
    if (emptyNode) {
      emptyNode.hidden = filteredPosts.length > 0;
    }
    gridRegion.hidden = !hasCards;

    const cardTotal = Math.max(filteredPosts.length - 1, 0);
    const currentPage = cardTotal === 0 ? 1 : Math.min(Math.ceil(Math.min(cardTotal, state.visibleCount) / pageSize), Math.max(1, Math.ceil(cardTotal / pageSize)));
    const totalPages = Math.max(1, Math.ceil(cardTotal / pageSize));

    if (countNode) {
      countNode.textContent = articleCountLabel(filteredPosts.length);
    }
    if (pageNode) {
      pageNode.innerHTML = `<span class="is-active">${currentPage}</span><span>${totalPages}</span>`;
    }
    if (sortButton) {
      sortButton.textContent = state.sort === 'newest' ? (copy.sort_newest || 'Newest first') : (copy.sort_oldest || 'Oldest first');
    }
    if (loadMoreButton) {
      loadMoreButton.hidden = cardTotal <= state.visibleCount;
    }
  };

  const applyState = () => {
    const filteredPosts = getFilteredPosts();
    pillButtons.forEach((button) => {
      button.classList.toggle('is-active', normalizeTag(button.dataset.tag) === state.activeTag);
    });
    renderFeatured(filteredPosts);
    renderPostCards(filteredPosts);
  };

  pillButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTag = normalizeTag(button.dataset.tag) || 'all';
      state.visibleCount = pageSize;
      applyState();
    });
  });

  if (sortButton) {
    sortButton.addEventListener('click', () => {
      state.sort = state.sort === 'newest' ? 'oldest' : 'newest';
      state.visibleCount = pageSize;
      applyState();
    });
  }

  if (loadMoreButton) {
    loadMoreButton.addEventListener('click', () => {
      state.visibleCount += pageSize;
      applyState();
    });
  }

  applyState();
})();
