const aquariumCanvas = document.querySelector("#aquariumCanvas");
const aquariumContext = aquariumCanvas.getContext("2d", { alpha: true });
const cards = [...document.querySelectorAll(".calculator-card")];
const pageDotsContainer = document.querySelector(".dock-pages");
const pageCount = document.querySelector("#page-count");
const carouselViewport = document.querySelector("#calculator-viewport");
const carouselTrack = document.querySelector("#calculator-track");
const calculatorFilter = document.querySelector("#calculator-filter");

let currentCard = 1;
let visibleCards = [...cards];
let pageDots = [];
let viewportWidth = 0;
let viewportHeight = 0;
let pixelRatio = 1;
let previousFrameTime = 0;
let animationFrame = null;
const aquariumFish = [];
const aquariumBubbles = [];
const lightRays = [];
const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

function addLoopingCard(sourceCard, position) {
  const clone = sourceCard.cloneNode(true);
  clone.dataset.carouselClone = position;
  clone.setAttribute("aria-hidden", "true");
  clone.classList.remove("is-current");
  clone.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = true;
  });
  return clone;
}

function renderPageDots() {
  pageDotsContainer.replaceChildren();
  pageDots = visibleCards.map((card, index) => {
    const dot = document.createElement("button");
    dot.className = "page-dot";
    dot.type = "button";
    dot.dataset.page = String(index);
    dot.setAttribute("aria-label", `${index + 1}. hesaplayıcı: ${card.querySelector("h2").textContent}`);
    dot.addEventListener("click", () => selectCard(index));
    pageDotsContainer.append(dot);
    return dot;
  });
}

function applyCategoryFilter() {
  const selectedCategory = calculatorFilter.value;
  visibleCards = cards.filter((card) => (
    selectedCategory === "all" || card.dataset.category === selectedCategory
  ));

  cards.forEach((card) => {
    card.hidden = !visibleCards.includes(card);
    card.classList.remove("is-current");
  });
  carouselTrack.querySelectorAll("[data-carousel-clone]").forEach((clone) => clone.remove());

  if (visibleCards.length > 1) {
    carouselTrack.prepend(addLoopingCard(visibleCards[visibleCards.length - 1], "start"));
    carouselTrack.append(addLoopingCard(visibleCards[0], "end"));
  }

  currentCard = selectedCategory === "all" ? Math.min(1, visibleCards.length - 1) : 0;
  renderPageDots();
  selectCard(currentCard);
}

const numberFormat = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});

function readNumber(form, name) {
  return Number(form.elements.namedItem(name).value);
}

function formatNumber(value) {
  return numberFormat.format(value);
}

function calculateVolume(form) {
  const length = readNumber(form, "length");
  const width = readNumber(form, "width");
  const height = readNumber(form, "height");
  const glassCm = readNumber(form, "glass") / 10;
  const displacement = readNumber(form, "displacement");
  const innerLength = length - 2 * glassCm;
  const innerWidth = width - 2 * glassCm;
  const innerHeight = height - glassCm;

  if (innerLength <= 0 || innerWidth <= 0 || innerHeight <= 0) {
    throw new Error("Cam kalınlığı ölçülerden küçük olmalı.");
  }

  const grossLiters = (length * width * height) / 1000;
  const innerLiters = (innerLength * innerWidth * innerHeight) / 1000;
  const netLiters = innerLiters * (1 - displacement / 100);

  return `Brüt: ${formatNumber(grossLiters)} L | Net: ${formatNumber(netLiters)} L`;
}

function calculateSubstrate(form) {
  const length = readNumber(form, "length");
  const width = readNumber(form, "width");
  const averageHeight = (readNumber(form, "front") + readNumber(form, "back")) / 2;
  const liters = (length * width * averageHeight) / 1000;
  const density = { quartz: 1.5, lava: 1.1, active: 0.9 }[form.elements.namedItem("material").value];

  return `${formatNumber(liters)} L | ${formatNumber(liters * density)} kg`;
}

function calculateGlass(form) {
  const length = readNumber(form, "length");
  const height = readNumber(form, "height");

  if (height <= 35 && length <= 80) {
    return "Önerilen cam: 6 mm";
  }
  if (height <= 45 && length <= 100) {
    return "Önerilen cam: 8 mm";
  }
  if (height <= 55 && length <= 120) {
    return "Önerilen cam: 10 mm (100 cm üzeri kayıt-kuşak önerilir)";
  }
  return "Önerilen cam: 12 mm (kayıt-kuşak zorunlu)";
}

function calculateFilter(form) {
  const liters = readNumber(form, "volume");
  const turnover = Number(form.elements.namedItem("density").value);
  return `Önerilen debi: ${formatNumber(liters * turnover)} L/saat`;
}

function calculateHeater(form) {
  const liters = readNumber(form, "volume");
  const difference = readNumber(form, "target") - readNumber(form, "room");
  const multiplier = difference <= 5 ? 0.8 : difference <= 10 ? 1.2 : 1.5;
  const neededWatts = liters * multiplier;
  const standardWatts = [25, 50, 75, 100, 150, 200, 300, 500];
  const selectedWatts = standardWatts.find((watts) => watts >= neededWatts);

  if (selectedWatts) {
    return `Önerilen ısıtıcı: ${selectedWatts} W`;
  }
  return "Önerilen ısıtıcı: 500 W (standart aralığın üst sınırı; daha yüksek güç gerekebilir)";
}

function calculateLight(form) {
  const liters = readNumber(form, "volume");
  const lumensPerLiter = Number(form.elements.namedItem("plants").value);
  return `Önerilen toplam: ${formatNumber(liters * lumensPerLiter)} lümen`;
}

function calculateEnergy(form) {
  const filter = readNumber(form, "filter");
  const light = readNumber(form, "light");
  const lightHours = readNumber(form, "hours");
  const heater = readNumber(form, "heater");
  const unitPrice = readNumber(form, "price");
  const dailyKwh = ((filter * 24) + (light * lightHours) + (heater * 7)) / 1000;
  const monthlyKwh = dailyKwh * 30;
  const monthlyCost = monthlyKwh * unitPrice;

  return `Aylık: ${formatNumber(monthlyKwh)} kWh | ${formatNumber(monthlyCost)} TL`;
}

function calculateCapacity(form) {
  const activeVolume = readNumber(form, "volume") * 0.85;
  const litersPerFish = Number(form.elements.namedItem("class").value);
  return `Maksimum ${Math.floor(activeVolume / litersPerFish)} adet`;
}

function calculateWaterChange(form) {
  const volume = readNumber(form, "volume");
  const ratio = readNumber(form, "ratio");
  const doseVolume = readNumber(form, "dose-volume");
  const changedWater = volume * (ratio / 100);
  const requiredDose = changedWater / doseVolume;

  return `Değişecek su: ${formatNumber(changedWater)} L | Eklenecek ilaç/gübre: ${formatNumber(requiredDose)} ml`;
}

function calculateCo2(form) {
  const ph = readNumber(form, "ph");
  const kh = readNumber(form, "kh");
  const co2 = 3 * kh * Math.pow(10, 7 - ph);

  if (co2 < 15) {
    return { message: `${formatNumber(co2)} ppm | Yetersiz`, status: "blue" };
  }
  if (co2 <= 30) {
    return { message: `${formatNumber(co2)} ppm | İdeal`, status: "green" };
  }
  return { message: `${formatNumber(co2)} ppm | Tehlikeli yüksek`, status: "red" };
}

function calculateTerrariumLayers(form) {
  const area = readNumber(form, "length") * readNumber(form, "width");
  const drainage = (area * 3) / 1000;
  const carbon = (area * 0.5) / 1000;
  const substrate = (area * 5) / 1000;

  return `Drenaj: ${formatNumber(drainage)} L | Aktif karbon: ${formatNumber(carbon)} L | Torf: ${formatNumber(substrate)} L`;
}

function calculateTerrariumClimate(form) {
  const container = form.elements.namedItem("container").value;
  const species = form.elements.namedItem("species").value;
  const recommendations = {
    closed: {
      tropical: "%80-90 nem | Haftada 1 kez hafif sisleme",
      succulent: "Kapalı cam sukulentler için uygun değil | Kabı açık/kuru tut",
      reptile: "%70-85 nem | Havalandırmayı ve türe özel nem ihtiyacını kontrol et",
    },
    semi: {
      tropical: "%65-80 nem | 2-3 günde bir hafif sisleme",
      succulent: "%40-55 nem | Toprak kurudukça, yaklaşık 10-12 günde bir az su ver",
      reptile: "%60-75 nem | Her gün kontrol et, gerektiğinde hafif sisle",
    },
    open: {
      tropical: "%50-65 nem | Her gün kontrol et, gerekirse hafif sisle",
      succulent: "%30-45 nem | Yapraklara sıkma, 12 günde bir toprağa damlat",
      reptile: "%50-65 nem | Günlük nem kontrolü yap, türe özel gereksinimi izle",
    },
  };

  return recommendations[container][species];
}

const calculators = {
  volume: calculateVolume,
  substrate: calculateSubstrate,
  glass: calculateGlass,
  filter: calculateFilter,
  heater: calculateHeater,
  light: calculateLight,
  energy: calculateEnergy,
  capacity: calculateCapacity,
  "water-change": calculateWaterChange,
  co2: calculateCo2,
  "terrarium-layers": calculateTerrariumLayers,
  "terrarium-climate": calculateTerrariumClimate,
};

function showResult(form, message, status = "success") {
  const result = form.querySelector(".calculation-result");
  result.textContent = message;
  result.dataset.status = status;
}

document.querySelectorAll(".calculator-card").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const result = form.querySelector(".calculation-result");
    delete result.dataset.status;

    try {
      const calculate = calculators[form.dataset.calculator];
      const calculation = calculate(form);
      if (typeof calculation === "string") {
        showResult(form, calculation);
      } else {
        showResult(form, calculation.message, calculation.status);
      }
    } catch (error) {
      showResult(form, error.message || "Bu değerlerle hesaplama yapılamadı.", "error");
    }
  });
});

function createFish() {
  const direction = Math.random() < 0.5 ? 1 : -1;
  const length = 25 + Math.random() * 36;
  return {
    x: direction === 1 ? Math.random() * viewportWidth : viewportWidth + Math.random() * viewportWidth,
    y: Math.random() * viewportHeight,
    length,
    height: length * (0.34 + Math.random() * 0.12),
    speed: 18 + Math.random() * 34,
    direction,
    phase: Math.random() * Math.PI * 2,
    wave: 8 + Math.random() * 22,
    color: Math.random() < 0.28 ? "#ff8c00" : "#00f2fe",
    opacity: 0.35 + Math.random() * 0.55,
  };
}

function resizeAquarium() {
  viewportWidth = window.innerWidth;
  viewportHeight = window.innerHeight;
  const isSmallScreen = viewportWidth < 620;
  pixelRatio = Math.min(window.devicePixelRatio || 1, isSmallScreen ? 1.5 : 2);
  aquariumCanvas.width = Math.round(viewportWidth * pixelRatio);
  aquariumCanvas.height = Math.round(viewportHeight * pixelRatio);
  aquariumContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  aquariumFish.length = 0;
  aquariumBubbles.length = 0;
  lightRays.length = 0;

  const fishCount = isSmallScreen ? 7 : 18;
  const bubbleCount = isSmallScreen ? 14 : 34;
  for (let index = 0; index < fishCount; index += 1) {
    aquariumFish.push(createFish());
  }
  for (let index = 0; index < bubbleCount; index += 1) {
    aquariumBubbles.push({
      x: Math.random() * viewportWidth,
      y: Math.random() * viewportHeight,
      radius: 2 + Math.random() * 5,
      speed: 12 + Math.random() * 24,
      sway: 5 + Math.random() * 15,
      phase: Math.random() * Math.PI * 2,
      opacity: 0.25 + Math.random() * 0.45,
    });
  }
  for (let index = 0; index < 6; index += 1) {
    lightRays.push({
      x: (index + Math.random() * 0.6) * viewportWidth / 6,
      width: 70 + Math.random() * 150,
      lean: -0.2 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function drawLightRays(time) {
  const ctx = aquariumContext;
  lightRays.forEach((ray) => {
    const shimmer = 0.45 + (Math.sin(time * 0.00045 + ray.phase) + 1) * 0.18;
    const topX = ray.x + Math.sin(time * 0.00025 + ray.phase) * 16;
    const bottomX = topX + ray.lean * viewportHeight;
    const gradient = ctx.createLinearGradient(topX, 0, bottomX, viewportHeight * 0.82);
    gradient.addColorStop(0, `rgba(0, 242, 254, ${shimmer * 0.15})`);
    gradient.addColorStop(0.55, `rgba(0, 242, 254, ${shimmer * 0.055})`);
    gradient.addColorStop(1, "rgba(0, 242, 254, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(topX - ray.width * 0.18, 0);
    ctx.lineTo(topX + ray.width * 0.18, 0);
    ctx.lineTo(bottomX + ray.width, viewportHeight * 0.82);
    ctx.lineTo(bottomX - ray.width, viewportHeight * 0.82);
    ctx.closePath();
    ctx.fill();
  });
}

function drawFish(fish, time, delta) {
  const ctx = aquariumContext;
  const length = fish.length;
  const height = fish.height;
  fish.x += fish.speed * fish.direction * delta;

  if (fish.direction === 1 && fish.x > viewportWidth + length) {
    fish.x = -length;
    fish.y = Math.random() * viewportHeight;
  } else if (fish.direction === -1 && fish.x < -length) {
    fish.x = viewportWidth + length;
    fish.y = Math.random() * viewportHeight;
  }

  const swimY = fish.y + Math.sin(time * 0.0008 + fish.phase) * fish.wave * 0.12;
  ctx.save();
  ctx.translate(fish.x, swimY);
  ctx.scale(fish.direction, 1);
  ctx.globalAlpha = fish.opacity;
  ctx.fillStyle = fish.color;
  ctx.shadowColor = fish.color;
  ctx.shadowBlur = 9;

  ctx.save();
  ctx.translate(-length * 0.27, 0);
  ctx.rotate(Math.sin(time * 0.012 + fish.phase) * 0.22);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-length * 0.28, -height * 0.55);
  ctx.lineTo(-length * 0.24, height * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(-length * 0.32, 0);
  ctx.quadraticCurveTo(-length * 0.04, -height * 0.7, length * 0.28, 0);
  ctx.quadraticCurveTo(-length * 0.04, height * 0.7, -length * 0.32, 0);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#052b35";
  ctx.beginPath();
  ctx.arc(length * 0.17, -height * 0.12, Math.max(1, height * 0.07), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBubbles(time, delta) {
  const ctx = aquariumContext;
  aquariumBubbles.forEach((bubble) => {
    bubble.y -= bubble.speed * delta;
    if (bubble.y < -bubble.radius * 2) {
      bubble.y = viewportHeight + bubble.radius;
      bubble.x = Math.random() * viewportWidth;
    }

    const x = bubble.x + Math.sin(time * 0.001 + bubble.phase) * bubble.sway;
    ctx.globalAlpha = bubble.opacity;
    ctx.strokeStyle = "rgba(178, 250, 248, 0.78)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, bubble.y, bubble.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
    ctx.beginPath();
    ctx.arc(x - bubble.radius * 0.3, bubble.y - bubble.radius * 0.32, Math.max(0.6, bubble.radius * 0.18), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawAquarium(time, delta) {
  aquariumContext.clearRect(0, 0, viewportWidth, viewportHeight);
  drawLightRays(time);
  aquariumFish.forEach((fish) => drawFish(fish, time, delta));
  drawBubbles(time, delta);
}

function animateAquarium(time) {
  const delta = previousFrameTime ? Math.min((time - previousFrameTime) / 1000, 0.05) : 0;
  previousFrameTime = time;
  drawAquarium(time, delta);
  if (!reducedMotionPreference.matches && !document.hidden) {
    animationFrame = window.requestAnimationFrame(animateAquarium);
  } else {
    animationFrame = null;
  }
}

function startAquariumAnimation() {
  if (animationFrame === null && !document.hidden) {
    previousFrameTime = 0;
    animationFrame = window.requestAnimationFrame(animateAquarium);
  }
}

function selectCard(index) {
  if (!visibleCards.length) {
    return;
  }

  currentCard = (index + visibleCards.length) % visibleCards.length;

  cards.forEach((card, cardIndex) => {
    card.classList.toggle("is-current", card === visibleCards[currentCard]);
  });

  pageDots.forEach((dot, dotIndex) => {
    dot.classList.toggle("is-selected", dotIndex === currentCard);
  });

  pageCount.innerHTML = `${String(currentCard + 1).padStart(2, "0")} <span>/ ${String(visibleCards.length).padStart(2, "0")}</span>`;
  positionCarousel();
}

function positionCarousel() {
  const selectedCard = visibleCards[currentCard];
  if (!selectedCard) {
    return;
  }

  const cardWidth = selectedCard.getBoundingClientRect().width;
  const centerOffset = (carouselViewport.clientWidth - cardWidth) / 2;
  const offset = centerOffset - selectedCard.offsetLeft;

  carouselTrack.style.transform = `translateX(${offset}px)`;
}

document.querySelector("#previous-card").addEventListener("click", () => {
  selectCard(currentCard - 1);
});

document.querySelector("#next-card").addEventListener("click", () => {
  selectCard(currentCard + 1);
});

calculatorFilter.addEventListener("change", applyCategoryFilter);

window.addEventListener("resize", positionCarousel);
applyCategoryFilter();

resizeAquarium();
drawAquarium(0, 0);
if (!reducedMotionPreference.matches) {
  startAquariumAnimation();
}

window.addEventListener("resize", () => {
  resizeAquarium();
  if (reducedMotionPreference.matches) {
    drawAquarium(0, 0);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && animationFrame !== null) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
  } else {
    startAquariumAnimation();
  }
});

reducedMotionPreference.addEventListener("change", () => {
  if (reducedMotionPreference.matches && animationFrame !== null) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    drawAquarium(0, 0);
  } else {
    startAquariumAnimation();
  }
});