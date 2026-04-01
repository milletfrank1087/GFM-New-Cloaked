/**
 * Gallery Module
 * Handles Swiper gallery initialization for campaign images
 */

function initGallery() {
  // Initialize thumbnail swiper first
  const galleryThumbs = new Swiper('.gallery-thumbs', {
    spaceBetween: 10,
    slidesPerView: 4,
    freeMode: true,
    watchSlidesProgress: true,
  });

  // Initialize main gallery with navigation and thumbnails
  const galleryMain = new Swiper('.gallery-main', {
    spaceBetween: 10,
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev',
    },
    thumbs: {
      swiper: galleryThumbs,
    },
  });

  return { galleryMain, galleryThumbs };
}
