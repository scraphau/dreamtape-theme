"use strict";

const APP_ID = "5284869";
const CREATE_BUNDLE_TRANSACTION_API = "https://api-service.loopwork.co/bundleTransaction";
const FILTER_BUNDLE_SP_API = "https://apiv2.loopwork.co/bundleStorefront/filterBundleSellingPlanIds";
const GET_PRODUCT_BUNDLE_DATA_API = "https://apiv2.loopwork.co/bundleStorefront/getChildVariants?id=";
const PRODUCT_QUANTITY_SELECTOR = ".quantity__input";
const GET_PREPAID_SELLING_PLAN_DATA_URL =
    "https://api.loopwork.co/api/merchant/sellingPlanGroups/sellingPlansWithDetails?shopifyIds=";


const productDataClass = "loopProductQuickJson",
    loopSubscriptionContainerId = "loop-subscription-container",
    oneTimePurchaseOptionClass = "loop-one-time-purchase-option",
    subscriptionGroupClass = "loop-subscription-group",
    purchaseOptionName = "loop_purchase_option",
    sellingPlanSelectorClass = "loop-selling-plan-selector";

const useCompareAtPrice = true; //change this to false to use price instead of compare_at_price
const myShopifyDomain = window.Shopify.shop;
const baseUrl = `${
    APP_ID === "5186329"
        ? "https://staging-cdn.loopwork.co"
        : "https://cdn.loopwork.co"
}/${myShopifyDomain}`;

/**
 * start application
 */
async function initLoopWidget(productId) {
    try {
        log(`start application: ${productId}`);
        showLoopSkeletonLoader(productId);
        const productData = getLoopProductData(productId);
        setupLoopDomListeners(productId);
        initializeWindowLoopProps();
        const loopSellingPlanGroups = getLoopSellingPlanGroups(
            productData?.selling_plan_groups
        );
        productData.selling_plan_groups = loopSellingPlanGroups;
        const loopProductVariants = getLoopProductVariants(
            productData.variants,
            loopSellingPlanGroups
        );
        productData.variants = loopProductVariants;
        window.loopProps[productId] = {
            product: productData,
        };
        generateLoopWidgetVariantSPMaps(productId);
        await fetchStoreJson(productId);
        await setLoopUIProperties(Shopify.shop);
        await processLoopBundleProduct(productId);
        await getLoopBundleSpgs(productId);
        showSellingPlanFieldsetLoop(productId);
        showLoopPurchaseOptionsLabel(productId);
        initializeLoopUI(productData);
        // comment listenLoopCustomEvent call to stop listening loop preset bundle add to cart event
        listenLoopCustomEvent();
        hideDifferentVariantSellingPlansLoop(productData);
        displayLoopWidget(productId);
        observeFormChangesLoop(productData);
        hideLoopSkeletonLoader(productId);
    } catch (error) {
        logError(error);
        hideLoopSkeletonLoader(productId);
    }
}

function widgetLogger(message, ...additionalData) {
    const prefix = "%cLoop Widget: ";
    let style = `background-color: #7D41FF; color: #FFFFFF; padding: 2px;`;
    console.log(prefix + message, style, ...additionalData);
}

/**
 * setup DOM listeners to update values like selling_plan, price etc.
 * @param {number} productId
 */
function setupLoopDomListeners(productId) {
    log(`setup dom listeners for ${productId}`);
    const parentContainer = getLoopSubscriptionContainer(productId);
    const oneTimeOptions = parentContainer.querySelectorAll(
        `.${oneTimePurchaseOptionClass}`
    );
    const sellingPlanGroupOptions = parentContainer.querySelectorAll(
        `.${subscriptionGroupClass}`
    );
    const purchaseOptions = parentContainer.querySelectorAll(
        `input[name=${purchaseOptionName}]`
    );
    const deliveryOptions = parentContainer.querySelectorAll(
        `.${sellingPlanSelectorClass}`
    );

    for (const option of oneTimeOptions) {
        option.addEventListener("click", clickOnSellingPlanGroupContainerLoop);
    }

    for (const option of sellingPlanGroupOptions) {
        option.addEventListener("click", clickOnSellingPlanGroupContainerLoop);
    }

    for (const option of purchaseOptions) {
        option.addEventListener("click", changeInSellingPlanGroupLoop);
    }

    for (const option of deliveryOptions) {
        option.addEventListener("change", changeInDeliveryOptionLoop);
    }
    log(`setup dom listeners complete for ${productId}`);
}

/**
 * initialize props to use at multiple places
 */
function initializeWindowLoopProps() {
    if (!window.loopProps) {
        window.loopProps = {};
    }
}

/**
 * returns loop subscriptions selling plan groups
 * @param {Array} sellingPlanGroups
 * @returns
 */
function getLoopSellingPlanGroups(sellingPlanGroups) {
    if (Array.isArray(sellingPlanGroups)) {
        return sellingPlanGroups.filter((s) => s.app_id === APP_ID);
    }
    return [];
}

/**
 * returns product variants with loop selling plan groups
 * @param {Array} variants
 * @param {Array} loopSellingPlanGroups
 * @returns
 */
function getLoopProductVariants(variants, loopSellingPlanGroups) {
    const loopSpgSet = new Set(loopSellingPlanGroups.map((s) => s.id));
    return variants.map((v) => {
        return {
            ...v,
            selling_plan_allocations: v.selling_plan_allocations.filter((s) =>
                loopSpgSet.has(s.selling_plan_group_id)
            ),
        };
    });
}

const isCacheExpired = (timestamp) => {
    const oneHour = 60 * 60 * 1000;
    return !timestamp || Date.now() - timestamp > oneHour;
};

function generateLoopWidgetVariantSPMaps(productId) {
    const variantToSellingPlanGroups = {};
    const variantToSellingPlans = {};
    const sellingPlanGroupToSellingPlans = {};

    window.loopProps[productId]["product"].variants.forEach((variant) => {
        variantToSellingPlanGroups[variant.id] = [];
        variantToSellingPlans[variant.id] = {};

        variant.selling_plan_allocations.forEach((allocation) => {
            if (
                !variantToSellingPlanGroups[variant.id].includes(
                    allocation.selling_plan_group_id
                )
            ) {
                variantToSellingPlanGroups[variant.id].push(
                    allocation.selling_plan_group_id
                );
            }
            if (
                !variantToSellingPlans[variant.id][
                    allocation.selling_plan_group_id
                ]
            ) {
                variantToSellingPlans[variant.id][
                    allocation.selling_plan_group_id
                ] = [];
            }
            variantToSellingPlans[variant.id][
                allocation.selling_plan_group_id
            ].push(allocation.selling_plan_id);
            if (
                !sellingPlanGroupToSellingPlans[
                    allocation.selling_plan_group_id
                ]
            ) {
                sellingPlanGroupToSellingPlans[
                    allocation.selling_plan_group_id
                ] = [];
            }
            if (
                !sellingPlanGroupToSellingPlans[
                    allocation.selling_plan_group_id
                ].includes(allocation.selling_plan_id)
            ) {
                sellingPlanGroupToSellingPlans[
                    allocation.selling_plan_group_id
                ].push(allocation.selling_plan_id);
            }
        });
    });
    window.loopProps[productId][
        "variantToSellingPlanGroups"
    ] = variantToSellingPlanGroups;
    window.loopProps[productId][
        "variantToSellingPlans"
    ] = variantToSellingPlans;
    window.loopProps[productId][
        "sellingPlanGroupToSellingPlans"
    ] = sellingPlanGroupToSellingPlans;
}

function loopWidgetHasCommonElements(arr1, arr2) {
    const set1 = new Set(arr1);
    return arr2.some((elem) => set1.has(elem));
}

function getCommonElements(arr1 = [], arr2 = []) {
    const set1 = new Set(arr1);
    return arr2.filter((elem) => set1.has(elem));
}

function getStoreDefaultPlanFromPrepaidV2(plans) {
    const data = Object.entries(plans)
        .filter(([key, value]) => value.isDefault === true)
        .map(([key, value]) => Number(key));
    return data;
}

function getStoreDefaultSellingPlanShopifyIds(productId) {
    if (
        window.loopProps[productId]["storeJson"].hasPrepaid &&
        window.loopProps[productId]["prepaidSellingPlans"]
    ) {
        return getStoreDefaultPlanFromPrepaidV2(
            window.loopProps[productId]["prepaidSellingPlans"]
        );
    }
    return (
        window.loopProps[productId]["storeJson"]
            .storeDefaultSellingPlanShopifyIds ?? []
    );
}

function selectDefaultPlanForAllGroups(productId, selectedVariantId) {
    const variantSellingPlanGroups =
        window.loopProps[productId]["variantToSellingPlans"][selectedVariantId];
    const storeDefaultSellingPlanShopifyIds = getStoreDefaultSellingPlanShopifyIds(
        productId
    );
    for (const groupId in variantSellingPlanGroups) {
        const groupSpIds = variantSellingPlanGroups[groupId];
        if (groupSpIds.length) {
            const defaultSellingPlanShopifyId = getCommonElements(
                storeDefaultSellingPlanShopifyIds,
                groupSpIds
            )?.[0];
            changeDropdownValueBySelectId(
                `loop-select-${selectedVariantId}-${groupId}`,
                defaultSellingPlanShopifyId
            );
            if (
                window.loopProps[productId]?.sellingPlanId &&
                window.loopProps[productId]?.sellingPlanGroupId === groupId
            ) {
                changeInDeliveryOptionLoopV2(
                    productId,
                    defaultSellingPlanShopifyId
                );
            }
        }
    }
}

function changeDropdownValueBySelectId(selectId, value) {
    if (!value || !selectId) return;
    const selectElement = document.getElementById(selectId);
    if (selectElement) {
        selectElement.value = `${value}`;
    }
}

const fetchWithCacheControl = async (url, key) => {
    const lastFetch = localStorage.getItem(`loop_cdn_timestamp_${key}`);

    if (isCacheExpired(lastFetch)) {
        localStorage.setItem(`loop_cdn_timestamp_${key}`, Date.now());

        return fetch(url, {
            method: "GET",
            cache: "reload",
            mode: "cors",
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
            },
        });
    }

    return fetch(url, {
        method: "GET",
        cache: "default",
        mode: "cors",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
        },
    });
};

async function fetchStoreJson(productId) {
    try {
        const storesRes = await fetchWithCacheControl(
            `${baseUrl}/store.json`,
            "store"
        );
        if (!storesRes) {
            throw new Error("Cannot connect to Loop widget CDN");
        }

        const storeJson = await storesRes.json();
        if (!storeJson) {
            throw new Error("Cannot fetch store data");
        }

        window.loopProps[productId].storeJson = { ...storeJson };
    } catch (error) {
        window.loopProps[productId].storeJson = null;
    }
}

async function setLoopUIProperties(shopifyDomain) {
    const loopUIProps = await fetchLoopUIProperties(shopifyDomain);
    window.loopPropsUI = {
        ...loopUIProps,
    };
}

async function fetchLoopUIProperties(shopifyDomain) {
    log(`fetch loop subscription UI props: ${shopifyDomain}`);
    const endpoint = `https://d217z8zw4dqir.cloudfront.net/${shopifyDomain}.json`;
    const response = await fetch(endpoint);
    return (await response.json()) ?? {};
}

// for showing fieldset where selling plans are present
function showSellingPlanFieldsetLoop(productId) {
    const loopSubscriptionWidget = getLoopSubscriptionContainer(
        productId
    ).querySelector("#loop-selling-plan-fieldset");
    if (loopSubscriptionWidget) {
        loopSubscriptionWidget.classList.remove(
            "loop-display-none",
            "loop-display-none-by-variant"
        );
    }
}

// show Purchase Option label
function showLoopPurchaseOptionsLabel(productId) {
    const elements = getLoopSubscriptionContainer(productId).querySelectorAll(
        ".loop-purchase-options-label"
    );
    if (elements) {
        for (const e of elements) {
            e.classList.remove(
                "loop-display-none",
                "loop-display-none-by-variant"
            );
        }
    }
}

function getLoopVariantId(productId) {
    return (
        window.loopProps[productId].selectedVariantId ||
        getVariantIdFromURLLoop(window.loopProps[productId].variants) ||
        getFirstAvailableVariantVariantIdLoop(productId)
    );
}

function initializeLoopUI(productData) {
    let variantId = getVariantIdFromURLLoop(productData.variants);
    if (!variantId) {
        variantId = getFirstAvailableVariantVariantIdLoop(productData.id);
    }
    loopInit({ productId: productData.id, product: productData, variantId });
}

function getVariantIdFromURLLoop(variants) {
    const currentPageUrl = document.URL;
    const url = new URL(currentPageUrl);
    const variantIdFromUrl = url.searchParams.get("variant") || "";
    const variantIdSet = new Set(variants?.map((v) => v.id));

    return variantIdSet.has(Number(variantIdFromUrl)) ? variantIdFromUrl : null;
}

function getFirstAvailableVariantVariantIdLoop(productId) {
    const productData = getLoopProductData(productId);
    const v = productData?.variants.find((v) => v.available);
    const variantId = v?.id;
    return variantId;
}

function displayLoopWidget(productId) {
    const loopWidget = getLoopSubscriptionContainer(productId);
    if (loopWidget) {
        loopWidget.classList.remove("loop-display-none");
    }
}

function observeFormChangesLoop(productData) {
    document.querySelectorAll("form").forEach((form) => {
        const variantElement = form.querySelector('[name="id"]');
        const loopVariantElement = form.querySelector(
            '[name="loop_variant_id"]'
        );
        if (loopVariantElement && variantElement?.value) {
            loopVariantElement.value = variantElement.value;
        }

        const variantIdSet = new Set(productData?.variants?.map((v) => v.id));
        if (
            variantElement?.value &&
            variantIdSet.has(Number(variantElement?.value))
        ) {
            const config = {
                attributes: true,
                childList: true,
                subtree: true,
            };

            const callback = (mutationsList, observer) => {
                const variantId = variantElement?.value ?? "";
                const loopVariantElementId = loopVariantElement?.value ?? "";
                if (
                    variantId &&
                    loopVariantElement &&
                    variantId !== loopVariantElementId
                ) {
                    loopVariantElement.value = variantId;
                    loopVariantChanged({ loopProduct: productData, variantId });
                }
            };

            const observer = new MutationObserver(callback);
            observer.observe(form, config);
        }
    });
}

/// *********************************** Legacy functions ***********************************************

//Global functions

// classes for showing price
const loopPriceSelectors = [
    ".price:not(.price--on-sale) .price__regular .price-item--regular",
    ".price.price--on-sale .price__sale .price-item--sale",
    ".product-single__prices .product__price:not(.product__price--compare)",
    ".product-pricing .product--price .price--main .money",
    "[data-zp-product-discount-price]",
    ".product-single__header .product__price",
    ".modal_price .current_price",
    ".product-area__col--price .current-price.theme-money",
    '[data-product-type="price"][data-pf-type="ProductPrice"]',
    ".product__price .fs-heading-4-base[data-price]",
    "#product-price .money[data-product-price]",
    "#ProductPrice",
    ".product-single__price",
    ".price:not(.price--on-sale) span.price-item--regular",
    ".product-price .price .money:not(.original)",
    ".price-box #price .price",
    ".product__price span[data-product-price]",
    ".product-form--price-wrapper .product-form--price",
    ".product-page--pricing--variant-price #price-field",
    ".price-reviews .product-price",
];

// makes a map object of instances of a key
const arrToInstanceCountObjLoop = (arr) =>
    arr.reduce((obj, e) => {
        obj[e] = (obj[e] || 0) + 1;
        return obj;
    }, {});

/**
 * returns variant from from window loop props
 * if selected then returns selected variant else first variant from loop props
 * @param {*} productId
 * @param {*} variantId
 * @returns
 */
function findSelectedVariantLoop(productId, variantId) {
    const product =
        getProductFromLoopProps(productId) || getLoopProductData(productId);
    const selectedVariantId = determineSelectedVariantIdLoop(
        variantId,
        productId,
        product
    );
    return findVariantByIdLoop(product, selectedVariantId);
}

function getProductFromLoopProps(productId) {
    return window.loopProps?.[productId]?.product;
}

function determineSelectedVariantIdLoop(variantId, productId, product) {
    if (variantId) return variantId;
    if (window.loopProps?.[productId]?.selectedVariantId)
        return window.loopProps[productId].selectedVariantId;
    return product.variants?.[0]?.id;
}

function findVariantByIdLoop(product, variantId) {
    return product.variants?.find(
        (variant) => Number(variant.id) === Number(variantId)
    );
}

/**
 * clicking the selected variant after 300ms
 * @param {*} variant
 * @param {*} productId
 */
function defaultSelectFirstSellingPlanLoop(variant, productId) {
    const loopPurchaseOptionsContainer = getLoopSubscriptionContainer(
        productId
    );
    const loopPurchaseOptions =
        loopPurchaseOptionsContainer.querySelectorAll(
            "input[name=loop_purchase_option]"
        ) || [];

    let isFirstOption = true;
    const { selling_plan_allocations } = variant;
    const spgIds =
        selling_plan_allocations?.map((spg) => spg.selling_plan_group_id) || [];

    loopPurchaseOptions.forEach((element) => {
        if (
            Number(element.dataset.variantId) === Number(variant.id) &&
            (window.loopProps[productId].previousSPGId &&
            spgIds.includes(window.loopProps[productId].previousSPGId)
                ? element.dataset.id ==
                  window.loopProps[productId].previousSPGId
                : isFirstOption)
        ) {
            isFirstOption = false;
            element.checked = true;

            setTimeout(() => {
                if (loopIsTouchDevice()) {
                    const { dataset } = element;
                    changeInSellingPlanGroupLoopMobile(
                        dataset.id,
                        dataset.name,
                        dataset.productId
                    );
                }
                element.click();
            }, 300);
        }
    });
}

// hides Purchase Option label
function hideLoopPurchaseOptionsLabel(productId) {
    const elements = getLoopSubscriptionContainer(productId).querySelectorAll(
        ".loop-purchase-options-label"
    );
    if (elements) {
        for (const e of elements) {
            e.classList.add(
                "loop-display-none",
                "loop-display-none-by-variant"
            );
        }
    }
}

// adds Purchase Option label text
function addLoopPurchaseOptionLabelText(productId) {
    let elements = getLoopSubscriptionContainer(productId).querySelectorAll(
        ".loop-purchase-options-label"
    );
    if (elements) {
        elements.forEach((element) => {
            if (element) {
                element.innerHTML = `${
                    window.loopPropsUI.loopPurchaseOptionslabel ||
                    "Purchase Options"
                }`;
            }
        });
    }
}

// One time purchase label text
function addLoopOneTimePurchaseOptionLabelText(productId) {
    let elements = getLoopSubscriptionContainer(productId).querySelectorAll(
        ".loop-one-time-purchase-option-label"
    );
    if (elements) {
        elements.forEach((element) => {
            if (element) {
                element.innerHTML = `${
                    window.loopPropsUI.loopOneTimePurchaselabel ||
                    "One time Purchase"
                }`;
            }
        });
    }
}

/**
 * Renders One time purchase option at bottom
 * @param {*} productId
 */
function showOneTimePurchaseOptionAtBottomLoop(productId) {
    const loopContainer = getLoopSubscriptionContainer(productId);

    const elementAtTop = loopContainer.querySelector(
        "#loop-one-time-purchase-option-at-top"
    );
    const elementAtBottom = loopContainer.querySelector(
        "#loop-one-time-purchase-option-at-bottom"
    );

    if (elementAtTop && elementAtBottom && elementAtTop.innerHTML) {
        elementAtBottom.innerHTML = elementAtTop.innerHTML;
        elementAtTop.innerHTML = "";
    }

    const loopSubscriptionGroupElements = loopContainer.querySelectorAll(
        ".loop-subscription-group"
    );
    loopSubscriptionGroupElements.forEach((element) => {
        element.classList.remove("loop-subscription-group-border-top");
        element.classList.add("loop-subscription-group-border-bottom");
    });
}

/**
 * Hides "Each" label in Price
 */
function hideEachLabelForPriceLoop() {
    const selectors = [
        ".loop-subscription-group-price-quantity",
        ".loop-one-time-purchase-option-price-quantity",
    ];

    selectors.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element) => {
            element.classList.add("loop-display-none");
        });
    });
}

/**
 * for displaying tooltip => removes loop-display-none class
 * @param {*} productId
 * @returns
 */
function displayLoopTooltip(productId) {
    const loopContainer = getLoopSubscriptionContainer(productId);
    const tooltipElement = loopContainer.querySelector("#loop-tooltip");

    if (!tooltipElement) return;

    tooltipElement.classList.remove("loop-display-none");

    updateLoopTooltipContent(
        loopContainer,
        "#loop-tooltip-label",
        window.loopPropsUI.subscriptionPopupLabel
    );
    updateLoopTooltipContent(
        loopContainer,
        "#loop-tooltip-description",
        window.loopPropsUI.subscriptionPopupDescription
    );

    const label = loopContainer.querySelector("#loop-tooltip-label");
    const description = loopContainer.querySelector(
        "#loop-tooltip-description"
    );

    if (label && description) {
        label.style.fill = window.getComputedStyle(description).color;
    }
}

function updateLoopTooltipContent(container, selector, content) {
    const element = container.querySelector(selector);
    if (element && content) {
        element.innerHTML = content;
    }
}

/**
 * for hiding tooltip => adds loop-display-none class
 * @param {*} productId
 */
function hideLoopTooltip(productId) {
    const element = getLoopSubscriptionContainer(productId).querySelector(
        "#loop-tooltip"
    );
    if (element) {
        element.classList.add("loop-display-none");
    }
}

// adds extra css styles and classes on loop-style
function addExtraLoopStyles() {
    if (window && window.loopPropsUI && window.loopPropsUI.style) {
        let classList = {
            purchase_option_label: [".loop-purchase-options-label"],
            widget_feildset: [".loop-selling-plan-fieldset"],
            selling_plan_group_container: [
                ".loop-one-time-purchase-option",
                ".loop-subscription-group",
            ],
            selling_plan_group_label: [
                ".loop-one-time-purchase-option-label",
                ".loop-subscription-group-label",
            ],
            selling_plan_label: [".loop-selling-plan-selector-label"],
            selling_plan_selector: [".loop-selling-plan-selector"],
            selling_plan_price_label: [
                ".loop-one-time-purchase-option-price-amount",
                ".loop-subscription-group-price-amount",
            ],
            selling_plan_price_subtitle_label: [
                ".loop-one-time-purchase-option-price-quantity",
                ".loop-subscription-group-price-quantity",
            ],
            selling_plan_description_label: [
                ".loop-selling-plan-selector-description",
            ],
            selling_plan_discount_badge_style: [
                ".loop-subscription-group-discount-badge",
            ],
            subscription_details_label: [".loop-tooltip-label"],
            subscription_details_popup: [
                ".loop-tooltiptext",
                ".loop-container-arrow",
                ".loop-tooltip-description",
            ],
            selling_plan_group_selected: [".loop-selected-selling-plan-group"],
            selling_plan_group_radio: [
                ".loop-subscription-group-radio",
                ".loop-one-time-purchase-option-radio",
            ],
        };

        const getProperties = ({ id, data }) => {
            if (data) {
                let keys = Object.keys(data);
                let properties = "";
                keys.forEach((key) => {
                    let value = data[key];
                    properties = ` ${properties} ${key}: ${value} !important;`;
                });
                return properties;
            } else {
                return "";
            }
        };

        const getClassName = ({ id, data }) => {
            return classList[id] || [];
        };

        let extraClasses = ``;
        const { style } = window.loopPropsUI;
        style.map((st) => {
            let classNames = getClassName(st);
            classNames.map((className) => {
                extraClasses =
                    extraClasses +
                    `
                 ${className} {
                     ${getProperties(st)}
                 }
             `;
            });
        });

        let loopStyles = document.querySelectorAll(".loop-style");
        if (loopStyles) {
            loopStyles.forEach((element) => {
                element.innerHTML = `${element.innerHTML}
                 ${extraClasses}
             `;
            });
        }
    }

    if (window && window.loopPropsUI && window.loopPropsUI.cssClassess) {
        let loopStyles = document.querySelectorAll(".loop-style");
        if (loopStyles) {
            loopStyles.forEach((element) => {
                element.innerHTML = `${element.innerHTML}
                 ${window.loopPropsUI.cssClassess}
             `;
            });
        }
    }
}

// for hiding fieldset where selling plans are present
function hideLoopSellingPlanFieldset(productId) {
    const loopSubscriptionWidget = getLoopSubscriptionContainer(
        productId
    ).querySelector("#loop-selling-plan-fieldset");
    if (loopSubscriptionWidget) {
        loopSubscriptionWidget.classList.add(
            "loop-display-none",
            "loop-display-none-by-variant"
        );
    }
}

// Changes based on loopPropsUI
function applyLoopSettings({ productId }) {
    let product = window.loopProps[productId].product;
    const variant = findSelectedVariantLoop(productId);
    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.displayLoopPurchaseOptionLabel === false
    ) {
        hideLoopPurchaseOptionsLabel(productId);
    }

    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.loopPurchaseOptionslabel
    ) {
        addLoopPurchaseOptionLabelText(productId);
    }

    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.loopOneTimePurchaselabel
    ) {
        addLoopOneTimePurchaseOptionLabelText(productId);
    }

    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.displayOneTimePurchaseOptionAtBottom
    ) {
        showOneTimePurchaseOptionAtBottomLoop(productId);

        const loopOneTimeOptions = getLoopSubscriptionContainer(
            productId
        ).querySelectorAll(".loop-one-time-purchase-option");
        loopOneTimeOptions.forEach((option) => {
            option.addEventListener(
                "click",
                clickOnSellingPlanGroupContainerLoop
            );
        });
        const loopPurchaseOptions = getLoopSubscriptionContainer(
            productId
        ).querySelectorAll("input[name=loop_purchase_option]");
        loopPurchaseOptions.forEach((option) => {
            option.addEventListener("click", changeInSellingPlanGroupLoop);
        });
    }

    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.displayEachLabelForPrice === false
    ) {
        hideEachLabelForPriceLoop();
    }

    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.hidePlanSelectorIfOnlyOne
    ) {
        const { availableSellingPlanAllocations = [] } = window.loopProps[
            productId
        ];
        let ids = [];
        availableSellingPlanAllocations.map((a) => {
            ids.push(a.selling_plan_group_id);
        });

        let idCount = arrToInstanceCountObjLoop(ids);
        Object.keys(idCount).forEach((key) => {
            let plan = idCount[key];
            if (plan === 1) {
                let id = `#loop-selling-plan-container-${variant.id}-${key}`;
                let parentElement = document.querySelector(id);
                if (parentElement) {
                    let label = parentElement.querySelector(
                        ".loop-selling-plan-selector-label"
                    );
                    let labelPlan = parentElement.querySelector(
                        `#loop-selling-plan-first-delivery-options-${variant.id}-${key}`
                    );
                    let planSelector = parentElement.querySelector(
                        ".loop-selling-plan-selector"
                    );
                    if (label) {
                        label.classList.add("loop-display-none");
                    }
                    if (labelPlan) {
                        labelPlan.classList.add("loop-display-none");
                    }
                    if (planSelector) {
                        planSelector.classList.add("loop-display-none");
                    }
                }
            }
        });
    }

    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.showPlanSelectorAsTextIfOnlyOnePlan &&
        !window.loopPropsUI.hidePlanSelectorIfOnlyOne
    ) {
        const { availableSellingPlanAllocations = [] } = window.loopProps[
            productId
        ];
        let ids = [];
        availableSellingPlanAllocations.map((a) => {
            ids.push(a.selling_plan_group_id);
        });

        let idCount = arrToInstanceCountObjLoop(ids);
        Object.keys(idCount).forEach((key) => {
            let plan = idCount[key];
            if (plan === 1) {
                let id = `#loop-selling-plan-first-delivery-options-${variant.id}-${key}`;
                let element = document.querySelector(id);
                if (element && element.classList) {
                    element.classList.remove("loop-display-none");
                }
                id = `#loop-select-${variant.id}-${key}`;
                element = document.querySelector(id);
                if (element) {
                    element.classList.add("loop-display-none");
                }
            }
        });
    }

    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.hideWholeWidgetIfOnlyOnePlan
    ) {
        if (product.requires_selling_plan) {
            //check if only for selling plan
            if (
                variant.selling_plan_allocations &&
                variant.selling_plan_allocations.length === 1
            ) {
                //has only 1 selling plan
                hideLoopSellingPlanFieldset(productId);
                hideLoopPurchaseOptionsLabel(productId);
            }
        }
    }

    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.hideRadioButtonIfOnlyOnePlan
    ) {
        if (product.requires_selling_plan) {
            //check if only for selling plan

            const { availableSellingPlanAllocations } = window.loopProps[
                productId
            ];
            let ids = [];
            availableSellingPlanAllocations.map((a) => {
                ids.push(a.selling_plan_group_id);
            });
            let idCount = arrToInstanceCountObjLoop(ids);
            let onlyOneSellingPlanGroup = false;
            if (Object.keys(idCount).length === 1) {
                onlyOneSellingPlanGroup = true;
            } else {
                onlyOneSellingPlanGroup = false;
            }

            if (onlyOneSellingPlanGroup) {
                //has only 1 selling plan

                let loopSubscriptionGroupRadio = getLoopSubscriptionContainer(
                    productId
                ).querySelectorAll(".loop-subscription-group-radio");
                if (loopSubscriptionGroupRadio) {
                    loopSubscriptionGroupRadio.forEach((element) => {
                        element.classList.add("loop-display-none");
                    });
                }
                let elements = getLoopSubscriptionContainer(
                    productId
                ).querySelectorAll(
                    `.loop-subscription-group-selling-plans-container`
                );
                if (elements) {
                    elements.forEach((element) => {
                        element.classList.add("loop-left-margin-0");
                    });
                }
            }
        }
    }

    addExtraLoopStyles();

    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.displaySubscriptionPopup &&
        variant &&
        variant.selling_plan_allocations &&
        variant.selling_plan_allocations.length
    ) {
        displayLoopTooltip(productId);
    } else {
        hideLoopTooltip(productId);
    }

    if (
        product &&
        product.requires_selling_plan &&
        Array.isArray(variant.selling_plan_allocations) &&
        variant.selling_plan_allocations.length
    ) {
        let parentId = `#loop-product-variant-${variant.id}`;
        let parentElement = getLoopSubscriptionContainer(
            productId
        ).querySelector(parentId);

        if (
            window &&
            window.loopPropsUI &&
            window.loopPropsUI.displayOneTimePurchaseOptionAtBottom
        ) {
            let id = `.loop-subscription-group`;
            let elements = parentElement.querySelectorAll(id);
            if (elements && elements.length) {
                let last = elements[elements.length - 1];
                last.style.borderBottom = "0";
                last.classList.remove("loop-subscription-group-border-bottom");
            }
        } else {
            let id = `.loop-subscription-group`;
            let elements = parentElement.querySelectorAll(id);
            if (elements && elements.length) {
                let first = elements[0];
                first.style.borderTop = "0";
                first.classList.remove("loop-subscription-group-border-top");
            }
        }
    }

    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.displayDiscountBadge
    ) {
        displayLoopDiscountBadge({ productId });
    } else {
        let loopSubscriptionDiscountBadge = document.querySelectorAll(
            ".loop-subscription-group-discount-badge"
        );
        if (loopSubscriptionDiscountBadge) {
            loopSubscriptionDiscountBadge.forEach((element) => {
                if (element) {
                    element.classList.add("loop-display-none");
                }
            });
        }
    }

    if (window && window.loopPropsUI && window.loopPropsUI.translationData) {
        let translationData = window.loopPropsUI.translationData || {};
        let mapElements = {
            widget_price_label_text: [
                ".loop-one-time-purchase-option-price-quantity",
                ".loop-subscription-group-price-quantity",
            ],
        };

        Object.keys(mapElements).forEach((key) => {
            if (translationData && translationData[key]) {
                let elementIds = mapElements[key];
                elementIds.map((id) => {
                    let elements = document.querySelectorAll(id);
                    if (elements) {
                        elements.forEach((element) => {
                            element.innerText = translationData[key];
                        });
                    }
                });
            }
        });
    }
}

/**
 * clicking the first purchase option on selling plan group change
 * @param {*} event
 * @returns
 */
function clickOnSellingPlanGroupContainerLoop(event) {
    const container =
        event.target.closest(".loop-subscription-group") ||
        event.target.closest(".loop-one-time-purchase-option");

    if (!container) return;

    const radio = container.querySelector('input[type="radio"]');
    const selectedPlanGroupId =
        window.loopProps[radio.dataset.productId]?.sellingPlanGroupId;

    if (radio?.dataset?.id !== selectedPlanGroupId) {
        radio.click();
    }
}

// on variant change
function loopVariantChanged({ loopProduct, variantId }) {
    loopInit({
        productId: loopProduct.id,
        product: JSON.parse(JSON.stringify(loopProduct)),
        variantId,
    });
}

// hides or shows loop-widget
function checkVariantsSellingPlanAllocationLoop(variant, productId) {
    const hasSellingPlans = variant?.selling_plan_allocations?.length > 0;
    if (hasSellingPlans) {
        //display loop widget
        showSellingPlanFieldsetLoop(productId);
        showLoopPurchaseOptionsLabel(productId);
    } else {
        //hide loop widget
        hideLoopSellingPlanFieldset(productId);
        hideLoopPurchaseOptionsLabel(productId);
    }
}

/**
 * makes one time purchase option selected
 * @param {*} variant
 * @param {*} productId
 */
function defaultSelectOneTimePurchaseOptionLoop(variant, productId) {
    const onetimeCheckRadioLoop = getLoopSubscriptionContainer(
        productId
    ).querySelector(`#loop-one-time-purchase-${productId}`);

    if (onetimeCheckRadioLoop) {
        onetimeCheckRadioLoop.checked = true;
        onetimeCheckRadioLoop.click();

        if (loopIsTouchDevice()) {
            const { dataset } = onetimeCheckRadioLoop;
            changeInSellingPlanGroupLoopMobile(
                dataset.id,
                dataset.name,
                dataset.productId
            );
        }
    } else {
        defaultSelectFirstSellingPlanLoop(variant, productId);
    }
}

/**
 * handles variant display and apply loop settings
 * @param {Object} param0
 */
function loopInit({ productId, product, variantId }) {
    updateLoopProperties({ product, productId, variantId });
    const selectedVariant = findSelectedVariantLoop(productId, variantId);
    toggleVariantDisplayLoop(product, selectedVariant.id);
    checkVariantsSellingPlanAllocationLoop(selectedVariant, productId);
    applyLoopSettings({ productId });
    applyDefaultSelectionBasedOnLoopSettings(selectedVariant, productId);
    hideLoopBundleSPG(productId);
}

function toggleVariantDisplayLoop(product, selectedVariantId) {
    product.variants.forEach((variant) => {
        const displayStyle =
            variant.id === selectedVariantId ? "block" : "none";
        document.querySelector(
            `#loop-product-variant-${variant.id}`
        ).style.display = displayStyle;
    });
}

function applyDefaultSelectionBasedOnLoopSettings(selectedVariant, productId) {
    const shouldDefaultToSubscription =
        window.loopPropsUI?.byDefaultChooseSubscriptionOption;

    if (shouldDefaultToSubscription) {
        defaultSelectFirstSellingPlanLoop(selectedVariant, productId);
        selectDefaultPlanForAllGroups(productId, selectedVariant.id);
    } else {
        defaultSelectOneTimePurchaseOptionLoop(selectedVariant, productId);
    }

    if (isProductBundle(productId)) {
        handleBundleWidgetVisibility(productId);
    }
}

// makes the chosen selling plan selected
function updateSelectDropDownDefaultValuesLoop({
    productId,
    variant,
    sellingPlanGroupId,
}) {
    const sellingPlanGroups =
        window.loopProps[productId].product.selling_plan_groups;

    if (!Array.isArray(sellingPlanGroups) || !sellingPlanGroups.length) {
        return;
    }

    sellingPlanGroups.forEach((spg) => {
        // if (sellingPlanGroupId !== spg.id) {
        resetSelectDropdownLoop(variant.id, spg.id);
        // }
    });
}

function resetSelectDropdownLoop(variantId, sellingPlanGroupId) {
    const selectTag = document.getElementById(
        `loop-select-${variantId}-${sellingPlanGroupId}`
    );
    if (selectTag) {
        selectTag.options[0].selected = true;
    }
}

//for touch devices
function changeInSellingPlanGroupLoopMobile(
    sellingPlanGroupId,
    sellingPlanGroupName,
    productId
) {
    if (!window.loopProps[productId].previousSPG) {
        window.loopProps[productId].previousSPGId = sellingPlanGroupId;
    }
    const variant = findSelectedVariantLoop(
        productId,
        window.loopProps[productId].selectedVariantId
    );
    let sellingPlans =
        variant.selling_plan_allocations.filter(
            (spa) => spa.selling_plan_group_id === sellingPlanGroupId
        ) || [];
    let sellingPlan =
        sellingPlans && sellingPlans.length ? sellingPlans[0] : {};
    let sellingPlanId = sellingPlan.selling_plan_id;
    updateLoopProperties({
        productId,
        variantId: variant.id,
        sellingPlanGroupId,
        sellingPlanGroupName,
        sellingPlanId,
        sellingPlan,
    });
    updateSelectDropDownDefaultValuesLoop({
        productId,
        variant,
        sellingPlanGroupId: sellingPlanGroupId,
    });
    updatePriceInParentElementsLoop({ productId });
    updateLoopSellingPlanDescriptionUI({ productId });
    displayLoopDiscountBadge({ productId });
    updateCartButtonTextLoop({ productId });
    updatePriceInUILoop({ productId });
    updatePrepaidPriceInUILoop({ productId });
    applyLoopBundleDiscount(productId);
    checkAllowCheckoutIfBundle(productId);
    let removeElementId = ".loop-selected-selling-plan-group";
    let elements = getLoopSubscriptionContainer(productId).querySelectorAll(
        removeElementId
    );
    if (elements) {
        elements.forEach((element) => {
            if (element) {
                element.classList.remove("loop-selected-selling-plan-group");
            }
        });
    }
    if (sellingPlanGroupId === "loop-one-time-purchase") {
        let elements = getLoopSubscriptionContainer(productId).querySelectorAll(
            ".loop-one-time-purchase-option"
        );
        if (elements) {
            elements.forEach((element) => {
                element.classList.add("loop-selected-selling-plan-group");
            });
        }
    } else {
        let elementId = `#loop-${variant.id}-${sellingPlanGroupId}`;
        let element = getLoopSubscriptionContainer(productId).querySelector(
            elementId
        );
        if (element) {
            element.classList.add("loop-selected-selling-plan-group");
        }
    }

    selectDefaultPlanForAllGroups(productId, variant.id);
}

// on change of selling plan group
function changeInSellingPlanGroupLoop(option) {
    let sellingPlanGroupId = option.target.dataset.id;
    let sellingPlanGroupName = option.target.dataset.name;
    let productId = option.target.dataset.productId;
    if (!window.loopProps[productId].previousSPG) {
        window.loopProps[productId].previousSPGId = sellingPlanGroupId;
    }
    const variant = findSelectedVariantLoop(
        productId,
        window.loopProps[productId].selectedVariantId
    );
    let sellingPlans =
        variant.selling_plan_allocations.filter(
            (spa) => spa.selling_plan_group_id === sellingPlanGroupId
        ) || [];
    let sellingPlan =
        sellingPlans && sellingPlans.length ? sellingPlans[0] : {};
    let sellingPlanId = sellingPlan.selling_plan_id;
    updateLoopProperties({
        productId,
        variantId: variant.id,
        sellingPlanGroupId,
        sellingPlanGroupName,
        sellingPlanId,
        sellingPlan,
    });
    updateSelectDropDownDefaultValuesLoop({
        productId,
        variant,
        sellingPlanGroupId: option.target.dataset.id,
    });
    updatePriceInParentElementsLoop({ productId });
    updateLoopSellingPlanDescriptionUI({ productId });
    displayLoopDiscountBadge({ productId });
    updateCartButtonTextLoop({ productId });
    updatePriceInUILoop({ productId });
    updatePrepaidPriceInUILoop({ productId });
    applyLoopBundleDiscount(productId);
    checkAllowCheckoutIfBundle(productId);

    let removeElementId = ".loop-selected-selling-plan-group";
    let elements = getLoopSubscriptionContainer(productId).querySelectorAll(
        removeElementId
    );
    if (elements) {
        elements.forEach((element) => {
            if (element) {
                element.classList.remove("loop-selected-selling-plan-group");
            }
        });
    }
    if (sellingPlanGroupId === "loop-one-time-purchase") {
        let elements = getLoopSubscriptionContainer(productId).querySelectorAll(
            ".loop-one-time-purchase-option"
        );
        if (elements) {
            elements.forEach((element) => {
                element.classList.add("loop-selected-selling-plan-group");
            });
        }
    } else {
        let elementId = `#loop-${variant.id}-${sellingPlanGroupId}`;
        let element = getLoopSubscriptionContainer(productId).querySelector(
            elementId
        );
        if (element) {
            element.classList.add("loop-selected-selling-plan-group");
        }
    }
    selectDefaultPlanForAllGroups(productId, variant.id);
}

function changeInDeliveryOptionLoop(option) {
    let sellingPlanId = option.target.value;
    let productId = option.target.dataset.productId;
    updateLoopProperties({ productId, sellingPlanId });
    updatePriceInParentElementsLoop({ productId });
    updateLoopSellingPlanDescriptionUI({ productId });
    displayLoopDiscountBadge({ productId });
    updatePriceInUILoop({ productId });
    updatePrepaidPriceInUILoop({ productId });
    applyLoopBundleDiscount(productId);
    checkAllowCheckoutIfBundle(productId);
}

function changeInDeliveryOptionLoopV2(productId, sellingPlanId) {
    updateLoopProperties({ productId, sellingPlanId });
    updatePriceInParentElementsLoop({ productId });
    updateLoopSellingPlanDescriptionUI({ productId });
    displayLoopDiscountBadge({ productId });
    updatePriceInUILoop({ productId });
    updatePrepaidPriceInUILoop({ productId });
    applyLoopBundleDiscount(productId);
    checkAllowCheckoutIfBundle(productId);
}

// discount badge handling
function displayLoopDiscountBadge({ productId }) {
    const prepaidPlansData =
        window.loopProps[productId]?.prepaidSellingPlans || {};

    const variant = findSelectedVariantLoop(productId);
    const { selling_plan_groups } = window.loopProps[productId].product;
    if (window && window.loopProps && window.loopPropsUI.displayDiscountBadge) {
        selling_plan_groups.map((spg) => {
            const { selling_plans } = spg;
            const firstSp = selling_plans[0];
            let deliveryFreq =
                prepaidPlansData[firstSp.id]?.deliveriesPerBillingCycle || 1;

            let discountList = [];
            selling_plans.map((sp) => {
                const delFreq =
                    prepaidPlansData[sp.id]?.deliveriesPerBillingCycle || 1;
                const { price_adjustments } = sp;
                let priceAdj = price_adjustments.length
                    ? price_adjustments[0]
                    : {};
                discountList.push({
                    value: priceAdj.value / delFreq,
                    value_type: priceAdj.value_type,
                    amount:
                        priceAdj.value_type === "fixed_amount"
                            ? priceAdj.value
                            : priceAdj.value_type === "price"
                            ? Number(variant.price) -
                              Number(priceAdj.value / delFreq)
                            : (Number(variant.price) * priceAdj.value) / 100,
                });
            });
            let selectedDiscount = discountList.reduce((prev, current) =>
                prev.amount > current.amount ? prev : current
            );

            //handling for prepaid
            if (deliveryFreq > 1) {
                const variantFirstSellingPlan = variant.selling_plan_allocations.find(
                    (sp) => sp.selling_plan_group_id === spg.id
                );
                let ssp =
                    selling_plans.find(
                        (sp) =>
                            sp.id ===
                            Number(variantFirstSellingPlan.selling_plan_id)
                    ) || {};
                selectedDiscount = ssp.price_adjustments[0];
                deliveryFreq =
                    prepaidPlansData[ssp.id]?.deliveriesPerBillingCycle || 1;
            }

            let id = `#loop-discount-badge-${variant.id}-${spg.id}`;
            let element = getLoopSubscriptionContainer(productId).querySelector(
                id
            );

            if (
                window.loopProps[productId] &&
                spg.id === window.loopProps[productId].sellingPlanGroupId
            ) {
                let ssp =
                    selling_plans.find(
                        (sp) =>
                            sp.id ===
                            Number(window.loopProps[productId].sellingPlanId)
                    ) || {};
                selectedDiscount = ssp.price_adjustments[0];
                deliveryFreq =
                    prepaidPlansData[ssp.id]?.deliveriesPerBillingCycle || 1;
            }
            if (element) {
                let discountText = "";
                if (
                    selectedDiscount &&
                    selectedDiscount.value_type === "fixed_amount"
                ) {
                    discountText = loopFormatMoney(
                        selectedDiscount.value,
                        true
                    );
                } else if (
                    selectedDiscount &&
                    selectedDiscount.value_type === "percentage"
                ) {
                    discountText = `${selectedDiscount.value}%`;
                } else if (
                    selectedDiscount &&
                    selectedDiscount.value_type === "price"
                ) {
                    if (deliveryFreq > 1) {
                        const dic =
                            ((Number(variant.price) -
                                Number(selectedDiscount.value / deliveryFreq)) /
                                Number(variant.price)) *
                            100;
                        discountText = `${Math.round(dic > 0 ? dic : 0)}%`;
                    } else {
                        discountText = loopFormatMoney(
                            Number(variant.price) -
                                Number(selectedDiscount.value / deliveryFreq) >
                                0
                                ? Number(variant.price) -
                                      Number(
                                          selectedDiscount.value / deliveryFreq
                                      )
                                : 0,
                            true
                        );
                    }
                }

                let text = window?.loopPropsUI?.discountBadgeText || " ";
                let matchText = "{{discount_value}}";
                let discountLabelText = text.replace(
                    `{discount_value}`,
                    discountText
                );
                element.innerHTML = `${discountLabelText}`;
                if (
                    (!selectedDiscount?.value &&
                        !Number(selectedDiscount?.value)) ||
                    (selectedDiscount &&
                        selectedDiscount.value_type === "price" &&
                        Math.round(
                            Number(variant.price) -
                                Number(selectedDiscount.value / deliveryFreq)
                        ) <= 0)
                ) {
                    element.classList.add("loop-display-none");
                } else {
                    element.classList.remove("loop-display-none");
                }
            }
        });
    } else {
        selling_plan_groups.map((spg) => {
            let id = `#loop-discount-badge-${variant.id}-${spg.id}`;
            let element = document.querySelector(id);
            if (element) {
                element.classList.add("loop-display-none");
            }
        });
    }
}

/**
 * returns the current selling plan
 * @param {*} param0
 * @returns
 */
function calculateCurrentSellingPlanLoop({
    productId,
    availableSellingPlanAllocations,
}) {
    const loopProductProps = window.loopProps[productId];
    const { sellingPlanId, sellingPlanGroupId } = loopProductProps;

    return (
        availableSellingPlanAllocations.find((sellingPlan) => {
            if (sellingPlan.selling_plan_group_id !== sellingPlanGroupId) {
                return false;
            }
            if (sellingPlanId) {
                return (
                    Number(sellingPlan.selling_plan_id) ===
                    Number(sellingPlanId)
                );
            }
            return true;
        }) || {}
    );
}

function updateLoopProperties({
    product,
    productId,
    variantId,
    sellingPlanGroupId,
    sellingPlanGroupName,
    sellingPlanId,
}) {
    let loopProperties = getLoopSubscriptionContainer(productId).querySelector(
        "#loop-selling-plan-fieldset"
    );
    if (variantId) {
        if (
            Number(variantId) !==
            Number(loopProperties.dataset.selectedVariantId)
        ) {
            loopProperties.dataset.sellingPlanGroupId = "";
            loopProperties.dataset.sellingPlanGroupName = "";
            loopProperties.dataset.sellingPlanId = "";
        }
        loopProperties.dataset.selectedVariantId = variantId;
    }

    if (sellingPlanGroupId) {
        loopProperties.dataset.sellingPlanGroupId = sellingPlanGroupId;
    }
    if (sellingPlanGroupName) {
        loopProperties.dataset.sellingPlanGroupName = sellingPlanGroupName;
    }

    if (product) {
        loopProperties.dataset.product = JSON.stringify(product);
    }

    if (sellingPlanId) {
        loopProperties.dataset.sellingPlanId = sellingPlanId;
    } else if (sellingPlanGroupId === "loop-one-time-purchase") {
        loopProperties.dataset.sellingPlanId = "";
        loopProperties.dataset.sellingPlan = {};
        loopProperties.dataset.sellingPlan = {};
    }
    if (!window.loopProps) {
        window.loopProps = {};
        window.loopProps[productId] = { product, productId };
    }

    const productBundleData = window.loopProps[productId]["productBundleData"];
    const previousSPGId = window.loopProps[productId]["previousSPGId"];
    const bundleSPGS = window.loopProps[productId]["bundleSPGS"];
    const storefrontExcludedSPGS =
        window.loopProps[productId]["storefrontExcludedSPGS"];
    const nonBundleSPGS = window.loopProps[productId]["nonBundleSPGS"];
    const prepaidSellingPlans =
        window.loopProps[productId]["prepaidSellingPlans"];
    const productData = window.loopProps[productId]["product"];
    const storeJson = window.loopProps[productId]["storeJson"];
    const variantToSellingPlanGroups =
        window.loopProps[productId]["variantToSellingPlanGroups"];
    const variantToSellingPlans =
        window.loopProps[productId]["variantToSellingPlans"];
    const sellingPlanGroupToSellingPlans =
        window.loopProps[productId]["sellingPlanGroupToSellingPlans"];

    window.loopProps[productId] = { ...loopProperties.dataset, productId };

    window.loopProps[productId]["productBundleData"] = productBundleData;
    window.loopProps[productId]["previousSPGId"] = previousSPGId;
    window.loopProps[productId]["prepaidSellingPlans"] = prepaidSellingPlans;
    window.loopProps[productId]["product"] = productData;
    window.loopProps[productId]["bundleSPGS"] = bundleSPGS;
    window.loopProps[productId][
        "storefrontExcludedSPGS"
    ] = storefrontExcludedSPGS;
    window.loopProps[productId]["nonBundleSPGS"] = nonBundleSPGS;
    window.loopProps[productId]["storeJson"] = storeJson;
    window.loopProps[productId][
        "variantToSellingPlanGroups"
    ] = variantToSellingPlanGroups;
    window.loopProps[productId][
        "variantToSellingPlans"
    ] = variantToSellingPlans;
    window.loopProps[productId][
        "sellingPlanGroupToSellingPlans"
    ] = sellingPlanGroupToSellingPlans;

    let variant = findSelectedVariantLoop(productId);
    let availableSellingPlanAllocations =
        variant && Array.isArray(variant.selling_plan_allocations)
            ? variant.selling_plan_allocations
            : [];
    window.loopProps[
        productId
    ].availableSellingPlanAllocations = availableSellingPlanAllocations;
    window.loopProps[productId].variant = variant;

    let sellingPlan = calculateCurrentSellingPlanLoop({
        availableSellingPlanAllocations,
        productId,
    });
    let selectedSellingPlanId = sellingPlan.selling_plan_id || "";
    window.loopProps[productId].sellingPlan = sellingPlan;

    let sellingPlanAllocation = availableSellingPlanAllocations.find((aspa) => {
        if (selectedSellingPlanId) {
            if (
                Number(aspa.selling_plan_id) === Number(selectedSellingPlanId)
            ) {
                return true;
            }
        }
    });
    window.loopProps[productId].sellingPlanAllocation = sellingPlanAllocation;

    const { selling_plan_groups } = window.loopProps[productId].product;
    window.loopProps[productId].sellingPlanDefination = {};
    window.loopProps[productId].sellingPlanPriceAdjustments = [];
    if (selling_plan_groups && Array.isArray(selling_plan_groups)) {
        selling_plan_groups.map((spg) => {
            if (spg.id === window.loopProps[productId].sellingPlanGroupId) {
                const { selling_plans } = spg;
                selling_plans.map((sp) => {
                    if (
                        sp.id ===
                        Number(window.loopProps[productId].sellingPlanId)
                    ) {
                        window.loopProps[productId].sellingPlanDefination = sp;
                        window.loopProps[
                            productId
                        ].sellingPlanPriceAdjustments = sp.price_adjustments;
                    }
                });
            }
        });
    }

    let sellingPlanRadio = getLoopSubscriptionContainer(
        productId
    ).querySelector('[name="selling_plan"]');
    if (sellingPlanRadio) {
        sellingPlanRadio.value = selectedSellingPlanId;
    }
    //insert selling plan value in all the product from whose id is productId
    document
        .querySelectorAll(`form[data-loop-product-id="${productId}"]`)
        .forEach((form) => {
            const existingInputs = form.querySelectorAll(
                'input[name="selling_plan"]'
            );
            if (existingInputs.length) {
                existingInputs.forEach((existingInput) => {
                    existingInput.remove();
                });
            }

            const hiddenInput = document.createElement("input");
            hiddenInput.type = "hidden";
            hiddenInput.name = "selling_plan";
            hiddenInput.value = selectedSellingPlanId;
            form.appendChild(hiddenInput);
        });
}

function updateCartButtonTextLoop({ productId }) {
    const parentElement =
        document.querySelector(`[data-loop-product-id="${productId}"]`) ||
        document;
    const isOneTimeOrder = determineOneTimeOrderLoop(productId);
    const addToCartButton = getAddToCartButtonLoop(parentElement);
    if (!addToCartButton) return;

    const buttonText = getButtonTextLoop(isOneTimeOrder, productId);
    updateButtonInnerHTMLLoop(addToCartButton, buttonText);
}

function determineOneTimeOrderLoop(productId) {
    const sellingPlanGroupId = window?.loopProps[productId]?.sellingPlanGroupId;
    return (
        !sellingPlanGroupId || sellingPlanGroupId === "loop-one-time-purchase"
    );
}

function getAddToCartButtonLoop(parentElement) {
    const selectors = [
        "button[type='submit'][name='add']",
        "button[type='button'][name='add']",
    ];
    // return selectors.find((selector) => parentElement.querySelector(selector));
    let addToCartBtn = null;
    selectors.map((selector) => {
        if (!addToCartBtn) {
            addToCartBtn = parentElement.querySelector(selector);
        }
        if (!addToCartBtn) {
            addToCartBtn = document.querySelector(selector);
        }
    });

    return addToCartBtn;
}

function getButtonTextLoop(isOneTimeOrder, productId) {
    if (!window.loopProps[productId]["variant"]["available"]) {
        return (
            window?.loopPropsUI?.translationData?.widget_out_of_stock_text ||
            "Out of Stock"
        );
    } else if (!isOneTimeOrder) {
        return (
            window?.loopPropsUI?.translationData
                ?.widget_add_to_cart_button_for_subscription ||
            "Add subscription to cart"
        );
    } else {
        return (
            window?.loopPropsUI?.translationData
                ?.widget_add_to_cart_button_for_one_time_purchase ||
            "Add to cart"
        );
    }
}

function updateButtonInnerHTMLLoop(button, text) {
    if (button.firstElementChild) {
        button.firstElementChild.innerHTML = text;
    } else {
        button.innerHTML = text;
    }
}

/**
 * formats value based on money/money_without_currency filter of shopify
 * @param {*} price
 * @param {*} removeEach
 * @returns
 */
function loopFormatMoney(price, removeEach) {
    if (Shopify.locale && Shopify.country && Shopify.currency.active) {
        return loopFormatPriceNew(
            price,
            Shopify.locale,
            Shopify.country,
            Shopify.currency.active
        );
    }

    const moneyFormat = document.querySelector("#loop-price-money-format")
        .innerText;
    const moneyWithoutCurrency = document.querySelector(
        "#loop-price-money_without_currency-format"
    ).innerText;

    let formattedPrice = loopFormatPrice(
        price,
        moneyFormat,
        moneyWithoutCurrency
    );

    if (removeEach) {
        formattedPrice = formattedPrice.replace("each", "");
    }
    return formattedPrice.trim();
}

function loopFormatPriceNew(value, locale, countryCode, currencyCode) {
    const decimalValue = value / 100;
    const formatter = new Intl.NumberFormat(`${locale}-${countryCode}`, {
        style: "currency",
        currency: `${currencyCode}`,
    });
    return formatter.format(decimalValue);
}

function loopFormatPrice(price, moneyFormat, moneyWithoutCurrency) {
    const priceValue = price / 100;

    if (moneyFormat.includes("0.00")) {
        return moneyFormat.replace("0.00", priceValue.toFixed(2));
    } else if (moneyFormat.includes("0,00")) {
        return moneyFormat.replace(
            "0,00",
            priceValue.toFixed(2).replace(".", ",")
        );
    } else if (moneyFormat.includes("0")) {
        const wholeNumberValue = Number(
            moneyWithoutCurrency.replace("0", priceValue)
        ).toFixed(0);
        return moneyFormat.replace("0", wholeNumberValue);
    }
    return moneyFormat;
}

/**
 * saved price label in percentage/fixed value
 * @param {} priceAdjustments
 * @returns
 */
function getSavedPriceLabel(priceAdjustments) {
    if (!Array.isArray(priceAdjustments) || !priceAdjustments.length) {
        return "";
    }

    const pa = priceAdjustments[0];
    if (pa.value_type === "percentage") {
        return `Save ${pa.value}%`;
    } else {
        return `Save ${loopFormatMoney(pa.value, true)}`;
    }
}

/**
 * hide/show of selling plan description
 * @param {*} param0
 * @returns
 */
function updateLoopSellingPlanDescriptionUI({ productId }) {
    const variant = findSelectedVariantLoop(productId);
    const loopPropsProduct = window.loopProps?.[productId];

    if (!loopPropsProduct?.sellingPlanGroupId) {
        return;
    }

    const descriptionValue =
        loopPropsProduct?.sellingPlanDefination?.description || "";
    const descriptionElement = document.querySelector(
        `#loop-selling-plan-description-${variant.id}-${loopPropsProduct.sellingPlanGroupId}`
    );

    updateLoopSellingPlanDescriptionElement(
        descriptionElement,
        descriptionValue
    );
}

function updateLoopSellingPlanDescriptionElement(
    descriptionElement,
    descriptionValue
) {
    if (!descriptionElement) return;

    descriptionElement.innerHTML = descriptionValue;
    if (!descriptionValue) {
        descriptionElement.classList.add("loop-display-none");
    } else {
        descriptionElement.classList.remove("loop-display-none");
    }
}

function updatePriceInParentElementsLoop({ productId }) {
    const currentPath = getCurrentPathLoop();
    const productHandle = window?.loopProps[productId]?.product?.handle;

    if (productHandle !== currentPath) {
        return;
    }

    const variant = findSelectedVariantLoop(productId);
    const price = determinePriceLoop(productId, variant);

    loopPriceSelectors.push(`.loop-product-${productId}`);
    updatePricesInUILoop(price);
}

function determinePriceLoop(productId, variant) {
    const sellingPlanPrice =
        window?.loopProps[productId]?.sellingPlanAllocation?.price;

    if (sellingPlanPrice) {
        return loopFormatMoney(sellingPlanPrice, true);
    }
    return loopFormatMoney(variant.price, true);
}

function updatePricesInUILoop(price) {
    return; //uncomment this to enable parent price update in PDP
    loopPriceSelectors.forEach((selector) => {
        const priceElement = document.querySelector(selector);
        if (priceElement) {
            priceElement.innerHTML = `${price}`;
        }
    });
}

function updatePriceInUILoop({ productId }) {
    let variant = findSelectedVariantLoop(
        productId,
        window.loopProps[productId].selectedVariantId
    );

    let sellingPlan =
        window.loopProps && window.loopProps[productId]
            ? window.loopProps[productId].sellingPlan
            : {};
    const product = window.loopProps[productId]?.product || {};
    const { selling_plan_groups } = product;
    const { selling_plan_allocations } = variant;
    selling_plan_groups.map((spg) => {
        if (Array.isArray(spg.selling_plans) && spg.selling_plans.length) {
            let firstSellingPlan = spg.selling_plans[0];
            let sellingPlanAllcotion =
                selling_plan_allocations.find(
                    (a) =>
                        Number(a.selling_plan_id) ===
                        Number(firstSellingPlan.id)
                ) || {};
            const {
                selling_plan_group_id,
                per_delivery_price,
            } = sellingPlanAllcotion;
            let element = document.querySelector(
                `#loop-price-${variant.id}-${selling_plan_group_id}`
            );
            if (element) {
                element.innerHTML = loopFormatMoney(per_delivery_price, true);
            }
        }
    });

    if (sellingPlan && sellingPlan.selling_plan_group_id) {
        const { selling_plan_group_id, per_delivery_price } = sellingPlan;
        let element = document.querySelector(
            `#loop-price-${variant.id}-${selling_plan_group_id}`
        );
        if (element) {
            element.innerHTML = loopFormatMoney(per_delivery_price, true);
        }
    }

    let loopOneTimePrice = getLoopSubscriptionContainer(
        productId
    ).querySelector("#loop-price-one-time");
    if (loopOneTimePrice) {
        loopOneTimePrice.innerHTML = loopFormatMoney(variant.price, true);
    }
}

/**
 *************** Utility functions ********************
 */

/**
 * log a message
 * @param {string} message
 */
function log(message) {
    widgetLogger(message);
}

/**
 * log error message
 * @param {Error} error
 */
function logError(error) {
    widgetLogger(error);
}

/**
 * initialize global loop data object
 * @param {number} productId
 */
function initializeLoopData(productId) {
    if (!window.LoopSubscriptions) {
        window.LoopSubscriptions = {};
    }
    window.LoopSubscriptions[productId] = getLoopProductData(productId);
}

/**
 * get product data from html element
 * @param {number} productId
 * @returns
 */
function getLoopProductData(productId) {
    const textData = document.querySelector(`.${productDataClass}-${productId}`)
        .textContent;
    return JSON.parse(textData);
}

/**
 *
 * @param {number} productId
 * @returns
 */
function getLoopSubscriptionContainer(productId) {
    return document.querySelector(
        `#${loopSubscriptionContainerId}-${productId}`
    );
}

/**
 *
 * @returns get current path
 */
function getCurrentPathLoop() {
    const pathParts = window.location.pathname.split("/");
    return pathParts[pathParts.length - 1];
}

/**
 *
 * @returns if touch device
 */
function loopIsTouchDevice() {
    return "ontouchstart" in document.documentElement;
}

/**
 **************** Bundle Functions Start ****************
 */

async function getLoopBundleSpgs(productId) {
    try {
        const spgs =
            loopProps[productId]?.product?.selling_plan_groups?.flatMap(
                (spg) => {
                    return spg?.selling_plans?.map((sp) => ({
                        selling_plan_group_id: spg.id,
                        selling_plan_id: sp.id,
                    }));
                }
            ) || [];

        const shopifySellingPlanIdsToExcludeOnWidget =
            window.loopProps[productId]["storeJson"]
                .shopifySellingPlanIdsToExcludeOnWidget ?? [];
        const bundleShopifySellingPlanIds =
            window.loopProps[productId]["storeJson"]
                .bundleShopifySellingPlanIds ?? [];

        const sps = [...new Set([...bundleShopifySellingPlanIds])];

        let bundleSellingPlanGroupIds = [];
        let nonBundleSellingPlanGroupIds = [];
        let hideLoopStorefrontExcludedGroupIds = [];

        for (const spg of spgs) {
            if (
                shopifySellingPlanIdsToExcludeOnWidget.includes(
                    spg.selling_plan_id
                )
            ) {
                hideLoopStorefrontExcludedGroupIds.push(
                    spg.selling_plan_group_id
                );
            } else if (
                sps.includes(spg.selling_plan_id) &&
                window.loopProps[productId]?.storeJson?.preferences
                    ?.hideBundleSellingPlansOnProductPage
            ) {
                bundleSellingPlanGroupIds.push(spg.selling_plan_group_id);
            } else {
                nonBundleSellingPlanGroupIds.push(spg.selling_plan_group_id);
            }
        }

        window.loopProps[productId]["bundleSPGS"] = [
            ...new Set(bundleSellingPlanGroupIds),
        ];
        window.loopProps[productId]["nonBundleSPGS"] = [
            ...new Set(nonBundleSellingPlanGroupIds),
        ];
        window.loopProps[productId]["storefrontExcludedSPGS"] = [
            ...new Set(hideLoopStorefrontExcludedGroupIds),
        ];
        hideLoopBundleSPG(productId);
        hideLoopStorefrontExcludedSPG(productId);

        if (window.loopProps[productId].storeJson.hasPrepaid) {
            const allSellingPlanIds =
                window.loopProps[
                    productId
                ]?.product?.selling_plan_groups?.flatMap((spg) => {
                    return spg?.selling_plans?.map((sp) => sp.id);
                }) || [];
            const spidsAsString = allSellingPlanIds.join(",");
            const prepaidUrl = `${GET_PREPAID_SELLING_PLAN_DATA_URL}${spidsAsString}`;

            const prepaidRes = await fetch(prepaidUrl, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            const prepaidResJSON = await prepaidRes.json();
            const prepaidData = prepaidResJSON.data;
            window.loopProps[productId]["prepaidSellingPlans"] =
                prepaidData?.sellingPlans || {};
        }
    } catch (error) {
        widgetLogger("getLoopBundleSpgs", error);
    }
}

function hideLoopBundleSPG(productId) {
    if (!isProductBundle(productId)) {
        const loopProps = window.loopProps[productId];
        const loopContainer = getLoopSubscriptionContainer(productId);
        if (loopContainer) {
            const bspgs = loopProps["bundleSPGS"];
            if (
                bspgs?.length &&
                loopProps?.storeJson?.preferences
                    ?.hideBundleSellingPlansOnProductPage
            ) {
                bspgs.forEach((spgId) => {
                    const bundlespg = loopContainer.querySelectorAll(
                        `#loop-selling_plan_group-${spgId}`
                    );
                    if (bundlespg?.length) {
                        bundlespg.forEach((spg) => {
                            spg.classList.add("loop-display-none");
                        });
                    }
                });
                clickUpdatedSPGLoop(productId);
            }
        }
    }
}

function hideLoopStorefrontExcludedSPG(productId) {
    try {
        const loopProps = window.loopProps[productId];
        const loopContainer = getLoopSubscriptionContainer(productId);
        if (loopContainer) {
            const excludedPlans = loopProps["storefrontExcludedSPGS"];
            excludedPlans?.forEach((spgId) => {
                const bundlespg = loopContainer.querySelectorAll(
                    `#loop-selling_plan_group-${spgId}`
                );
                if (bundlespg?.length) {
                    bundlespg.forEach((spg) => {
                        spg.classList.add("loop-display-none");
                    });
                }
            });
            clickUpdatedSPGLoop(productId);
        }
    } catch (error) {
        widgetLogger("error", error);
    }
}

function clickUpdatedSPGLoop(productId) {
    showSellingPlanFieldsetLoop(productId);
    if (
        window &&
        window.loopPropsUI &&
        window.loopPropsUI.displayLoopPurchaseOptionLabel
    ) {
        showLoopPurchaseOptionsLabel(productId);
    } else {
        hideLoopPurchaseOptionsLabel(productId);
    }

    const selectedVariantId = getLoopVariantId(productId);
    const selectedVariant = window.loopProps[productId].product.variants.find(
        (v) => v.id == selectedVariantId
    );
    let nonBundleSpgs = window.loopProps[productId]["nonBundleSPGS"] ?? [];
    const bundleSpgs = window.loopProps[productId]["bundleSPGS"] ?? [];
    const variants = window.loopProps[productId].product.variants;
    const variantIdFromUrl =
        getVariantIdFromURLLoop(variants) ??
        getFirstAvailableVariantVariantIdLoop(productId);
    const variant =
        variants.find((v) => v.id == variantIdFromUrl) ?? variants[0];
    const variantSpgs = variant.selling_plan_allocations.map(
        (spg) => spg.selling_plan_group_id
    );
    nonBundleSpgs = nonBundleSpgs.filter((spg) => variantSpgs.includes(spg));

    if (isProductBundle(productId)) {
        if (
            bundleSpgs.length !== 0 &&
            window.loopPropsUI.byDefaultChooseSubscriptionOption
        ) {
            showLoopWidget(productId);
            const firstAvailableBundleSpg = bundleSpgs[0];
            const spgDiv = getLoopSubscriptionContainer(
                productId
            ).querySelectorAll(
                `#loop-selling_plan_group-${firstAvailableBundleSpg}`
            );
            spgDiv.forEach((node) => {
                const childNodes = node.querySelectorAll(
                    `#loop-allocation-${firstAvailableBundleSpg}`
                );
                childNodes.forEach((ele) => {
                    const targetNodes = ele.querySelectorAll(
                        `#loop-${selectedVariantId}-${firstAvailableBundleSpg}`
                    );
                    targetNodes.forEach((targetNode) => {
                        targetNode.click();
                    });
                });
            });
        } else {
            setTimeout(
                () =>
                    defaultSelectOneTimePurchaseOptionLoop(
                        selectedVariant,
                        productId
                    ),
                500
            );
        }
    } else if (
        nonBundleSpgs.length !== 0 &&
        window.loopPropsUI.byDefaultChooseSubscriptionOption
    ) {
        showLoopWidget(productId);
        const firstAvailableNonBundleSpg = nonBundleSpgs[0];
        const spgDiv = getLoopSubscriptionContainer(productId).querySelectorAll(
            `#loop-selling_plan_group-${firstAvailableNonBundleSpg}`
        );
        spgDiv.forEach((node) => {
            const childNodes = node.querySelectorAll(
                `#loop-allocation-${firstAvailableNonBundleSpg}`
            );
            childNodes.forEach((ele) => {
                const targetNodes = ele.querySelectorAll(
                    `#loop-${selectedVariantId}-${firstAvailableNonBundleSpg}`
                );
                targetNodes.forEach((targetNode) => {
                    targetNode.click();
                });
            });
        });
    } else {
        if (nonBundleSpgs.length === 0) {
            hideLoopWidget(productId);
        }
        setTimeout(
            () =>
                defaultSelectOneTimePurchaseOptionLoop(
                    selectedVariant,
                    productId
                ),
            500
        );
    }
}

function showLoopWidget(productId) {
    const loopWidgetContainer = document.getElementById(
        `loop-subscription-container-${productId}`
    );

    if (loopWidgetContainer) {
        loopWidgetContainer.style.display = "block";
    }
}

function showLoopSkeletonLoader(productId) {
    const loopWidgetSkeleton = document.getElementById(
        `loop-widget-skeleton-loader-container-id-${productId}`
    );

    if (loopWidgetSkeleton) {
        loopWidgetSkeleton.style.display = "block";
    }
}

function hideLoopSkeletonLoader(productId) {
    const skeletons = document.querySelectorAll(
        ".loop-widget-skeleton-loader-container"
    );

    if (skeletons.length > 0) {
        skeletons.forEach((skeleton) => {
            if (skeleton) {
                skeleton.style.display = "none";
            }
        });
    }
}

function hideLoopWidget(productId) {
    const loopWidgetContainer = document.getElementById(
        `loop-subscription-container-${productId}`
    );
    if (loopWidgetContainer) {
        loopWidgetContainer.style.display = "none";
    }
}

function isProductBundle(productId) {
    const storeJson = window.loopProps[productId]["storeJson"];
    return !!(
        storeJson &&
        storeJson.hasPresetBundles &&
        storeJson.presetBundleShopifyProductIds.includes(Number(productId))
    );
}

async function getBundleDataByProductId(productId) {
    const storeJson = window.loopProps[productId]["storeJson"];
    if (isProductBundle(productId)) {
        const presetUrl = `${baseUrl}/presetBundles/${productId}.json`;
        const presetRes = await fetchWithCacheControl(presetUrl, "preset");
        const productBundleData = await presetRes.json();
        window.loopProps[productId]["productBundleData"] = {
            ...productBundleData,
        };
        return productBundleData;
    } else {
        if (!storeJson) {
            widgetLogger("storeJson is not defined");
            return;
        }
        if (!storeJson.hasPresetBundles) {
            widgetLogger("No preset bundles");
            return;
        }
        if (!storeJson.presetBundleShopifyProductIds.includes(productId)) {
            widgetLogger("Product is not a preset bundle");
            return;
        }
    }
}

function handleBundleWidgetVisibility(productId) {
    if (
        window.loopProps[productId].productBundleData.purchaseType ===
        "SUBSCRIPTION"
    ) {
        hideOneTimePurchaseOptionLoop(productId);
        const selectedVariantId = getLoopVariantId(productId);
        const selectedVariant = window.loopProps[
            productId
        ].product.variants.find((v) => v.id == selectedVariantId);
        defaultSelectFirstSellingPlanLoop(selectedVariant, productId);
    } else if (
        window.loopProps[productId].productBundleData.purchaseType === "ONETIME"
    ) {
        // hide widget
        hideLoopSellingPlanFieldset(productId);
        hideLoopPurchaseOptionsLabel(productId);
        defaultSelectOneTimePurchaseOptionLoop(null, productId);
    }
}

// override product page btn
async function processLoopBundleProduct(productId) {
    try {
        const productBundleData = await getBundleDataByProductId(productId);
        if (productBundleData) {
            overrideAddToCartButtonLoop(productId, productBundleData.variants);
            handleBundleWidgetVisibility(productId);
            applyLoopBundleDiscount(productId);
            checkAllowCheckoutIfBundle(productId);
        }
    } catch (error) {
        widgetLogger("processLoopBundleProduct", error);
    }
}

function checkAllowCheckoutIfBundle(productId) {
    enableAddToCartBtnLoop(productId);
    const selectedVariantId = window.loopProps[productId].selectedVariantId;
    if (isProductBundle(productId) && selectedVariantId) {
        const selectedVariant = getLoopWidgetBundleVariantInfo(
            productId,
            selectedVariantId
        );
        const allowCheckout = selectedVariant.mappedProductVariants.length > 0;
        const outOfStock = selectedVariant?.outOfStock;

        if (outOfStock) {
            const buttonText =
                window?.loopPropsUI?.translationData
                    ?.widget_out_of_stock_text || "Out of Stock";
            const parentElement =
                document.querySelector(
                    `[data-loop-product-id="${productId}"]`
                ) || document;
            const addToCartButton = getAddToCartButtonLoop(parentElement);
            if (addToCartButton) {
                setTimeout(() => {
                    updateButtonInnerHTMLLoop(addToCartButton, buttonText);
                }, 500);
            }
        }

        if (!allowCheckout || outOfStock) {
            disableAddToCartBtnLoop(productId);
        }
    }
}

function getBundleVariantDiscountInfo(
    productId,
    selectedVariantId,
    selectedSellingPlanId
) {
    const bundleVariant = getLoopWidgetBundleVariantInfo(
        productId,
        selectedVariantId
    );
    const discount = selectedSellingPlanId
        ? bundleVariant.mappedDiscounts.find(
              (d) => d.purchaseType === "SUBSCRIPTION"
          )
        : bundleVariant.mappedDiscounts.find(
              (d) => d.purchaseType !== "SUBSCRIPTION"
          );
    return discount;
}

function applyLoopBundleDiscount(productId) {
    if (!isProductBundle(productId)) {
        return;
    }

    let variant = findSelectedVariantLoop(
        productId,
        window.loopProps[productId].selectedVariantId
    );
    let selectedVariantId = window.loopProps[productId].selectedVariantId;
    const bundleVariantInfo = getLoopWidgetBundleVariantInfo(
        productId,
        selectedVariantId
    );
    if (!bundleVariantInfo?.mappedDiscounts?.length) {
        return;
    }
    const conversionRate = window.Shopify.currency.rate;
    let sellingPlan =
        window.loopProps && window.loopProps[productId]
            ? window.loopProps[productId].sellingPlan
            : {};
    const product = window.loopProps[productId]?.product || {};
    const { selling_plan_groups } = product;
    const { selling_plan_allocations } = variant;

    selling_plan_groups.map((spg) => {
        if (Array.isArray(spg.selling_plans) && spg.selling_plans.length) {
            let firstSellingPlan = spg.selling_plans[0];
            let sellingPlanAllocation =
                selling_plan_allocations.find(
                    (a) =>
                        Number(a.selling_plan_id) ===
                        Number(firstSellingPlan.id)
                ) || {};
            const {
                selling_plan_group_id,
                price,
                compare_at_price,
            } = sellingPlanAllocation;
            const originaPrice = useCompareAtPrice
                ? compare_at_price || variant.price
                : price;
            let element = document.querySelector(
                `#loop-price-${variant.id}-${selling_plan_group_id}`
            );
            let elementOriginal = document.querySelector(
                `#loop-price-original-${variant.id}-${selling_plan_group_id}`
            );

            if (elementOriginal) {
                elementOriginal.innerHTML = loopFormatMoney(originaPrice, true);
                elementOriginal.classList.remove("loop-display-none");
                elementOriginal.style.textDecorationLine = "line-through";
            }
            if (element) {
                const bundlePrice =
                    bundleVariantInfo.sellingPlanPrices[firstSellingPlan.id] *
                    100 *
                    conversionRate;
                element.innerHTML = loopFormatMoney(bundlePrice, true);

                let totalDiscount = Math.round(
                    ((originaPrice - bundlePrice) / originaPrice) * 100
                );
                const discountEle = document.querySelector(
                    `#loop-discount-badge-${variant.id}-${selling_plan_group_id}`
                );
                let discountText = `${totalDiscount > 0 ? totalDiscount : 0}%`;
                let text = window?.loopPropsUI?.discountBadgeText || " ";
                let discountLabelText = text.replace(
                    `{discount_value}`,
                    discountText
                );
                discountEle.innerHTML = `${discountLabelText}`;
                if (
                    totalDiscount > 0 &&
                    window.loopPropsUI.displayDiscountBadge
                ) {
                    discountEle.classList.remove("loop-display-none");
                } else {
                    discountEle.classList.add("loop-display-none");
                }
            }

            if (
                elementOriginal &&
                element?.innerHTML == elementOriginal?.innerHTML
            ) {
                elementOriginal.classList.add("loop-display-none");
            }
        }
    });

    if (sellingPlan && sellingPlan.selling_plan_group_id) {
        const { selling_plan_group_id, price, compare_at_price } = sellingPlan;
        const originaPrice = useCompareAtPrice
            ? compare_at_price || variant.price
            : price;
        let element = document.querySelector(
            `#loop-price-${variant.id}-${selling_plan_group_id}`
        );
        let elementOriginal = document.querySelector(
            `#loop-price-original-${variant.id}-${selling_plan_group_id}`
        );

        if (elementOriginal) {
            elementOriginal.innerHTML = loopFormatMoney(originaPrice, true);
            elementOriginal.classList.remove("loop-display-none");
            elementOriginal.style.textDecorationLine = "line-through";
        }
        if (element) {
            const bundlePrice =
                bundleVariantInfo.sellingPlanPrices[
                    sellingPlan.selling_plan_id
                ] *
                100 *
                conversionRate;
            element.innerHTML = loopFormatMoney(bundlePrice, true);

            let totalDiscount = Math.round(
                ((originaPrice - bundlePrice) / originaPrice) * 100
            );
            const discountEle = document.querySelector(
                `#loop-discount-badge-${variant.id}-${selling_plan_group_id}`
            );
            let discountText = `${totalDiscount > 0 ? totalDiscount : 0}%`;
            let text = window?.loopPropsUI?.discountBadgeText || " ";
            let discountLabelText = text.replace(
                `{discount_value}`,
                discountText
            );
            discountEle.innerHTML = `${discountLabelText}`;
            if (totalDiscount > 0 && window.loopPropsUI.displayDiscountBadge) {
                discountEle.classList.remove("loop-display-none");
            } else {
                discountEle.classList.add("loop-display-none");
            }
        }
        if (
            elementOriginal &&
            element?.innerHTML == elementOriginal?.innerHTML
        ) {
            elementOriginal.classList.add("loop-display-none");
        }
    }

    const originaPriceOnetime = useCompareAtPrice
        ? variant.compare_at_price || variant.price
        : variant.price;
    const bundlePriceOnetimeDiscounted = bundleVariantInfo.oneTimePrice;
    let loopOneTimePrice = getLoopSubscriptionContainer(
        productId
    ).querySelector("#loop-price-one-time");
    let loopOneTimePriceOriginal = getLoopSubscriptionContainer(
        productId
    ).querySelector("#loop-price-one-time-original");
    let bundlePriceOnetime = originaPriceOnetime;
    if (loopOneTimePrice) {
        if (bundlePriceOnetimeDiscounted) {
            bundlePriceOnetime =
                bundlePriceOnetimeDiscounted * 100 * conversionRate;
        }
        loopOneTimePrice.innerHTML = loopFormatMoney(bundlePriceOnetime, true);
    }
    if (loopOneTimePriceOriginal) {
        let val = originaPriceOnetime;
        loopOneTimePriceOriginal.innerHTML = loopFormatMoney(val, true);
        loopOneTimePriceOriginal.classList.remove("loop-display-none");
        loopOneTimePriceOriginal.style.textDecorationLine = "line-through";

        if (bundlePriceOnetimeDiscounted) {
            let totalDiscount = Math.round(
                ((originaPriceOnetime -
                    bundlePriceOnetimeDiscounted * 100 * conversionRate) /
                    originaPriceOnetime) *
                    100
            );
            const discountEle = document.querySelector(
                `#loop-discount-badge-onetime`
            );
            let discountText = `${totalDiscount > 0 ? totalDiscount : 0}%`;
            let text = window?.loopPropsUI?.discountBadgeText || " ";
            let discountLabelText = text.replace(
                `{discount_value}`,
                discountText
            );
            discountEle.innerHTML = `${discountLabelText}`;
            if (totalDiscount > 0) {
                // discountEle.classList.remove("loop-display-none");
            }
        }
    }
    if (
        loopOneTimePrice &&
        loopOneTimePriceOriginal &&
        loopOneTimePrice.innerHTML == loopOneTimePriceOriginal.innerHTML
    ) {
        loopOneTimePriceOriginal.classList.add("loop-display-none");
    }
}

function listenLoopCustomEvent() {
    document.addEventListener(
        "loopPresetAddToCartSuccessEvent",
        function (event) {
            const productId = event.detail.productId;
            const response = event.detail.response;
            window.location.href = "/cart";
            widgetLogger(
                `Loop Product ${productId} added to cart. Response:`,
                response
            );
        }
    );
}

function removeAllEventListenersLoop(element) {
    const clone = element.cloneNode(true);
    element.parentNode.replaceChild(clone, element);
    return clone;
}

function overrideAddToCartButtonLoop(productId) {
    const productForms = document.querySelectorAll(
        `[data-loop-product-id="${productId}"]`
    );
    productForms.forEach((form) => {
        let submitButtons = form.querySelectorAll("button[type=submit]");
        if (submitButtons.length === 0) {
            submitButtons = form.querySelectorAll("button");
        }
        submitButtons.forEach((btn) => {
            btn = removeAllEventListenersLoop(btn);
            btn.addEventListener("click", (event) => {
                const quantity = document.querySelector(
                    PRODUCT_QUANTITY_SELECTOR
                );
                loopHandleAddToCart(event, productId, quantity?.value);
            });
        });
    });
}

function hideOneTimePurchaseOptionLoop(productId) {
    document
        .querySelectorAll(`form[data-loop-product-id="${productId}"]`)
        .forEach((form) => {
            form.querySelectorAll(".loop-one-time-purchase-option").forEach(
                (option) => {
                    option.classList.add("loop-display-none");
                }
            );
        });
}

function disableAddToCartBtnLoop(productId) {
    const productForms = document.querySelectorAll(
        `[data-loop-product-id="${productId}"]`
    );
    productForms.forEach((form) => {
        const submitButtons = form.querySelectorAll("button");
        submitButtons.forEach((btn) => {
            btn.disabled = true;
        });
    });
}

function enableAddToCartBtnLoop(productId) {
    const productForms = document.querySelectorAll(
        `[data-loop-product-id="${productId}"]`
    );
    productForms.forEach((form) => {
        const submitButtons = form.querySelectorAll("button");
        submitButtons.forEach((btn) => {
            btn.disabled = false;
        });
    });
}

function getSelectedSellingPlanLoop(productId) {
    let sp = null;
    document
        .querySelectorAll(`form[data-loop-product-id="${productId}"]`)
        .forEach((form) => {
            const existingInput = form.querySelector(
                'input[name="selling_plan"]'
            );
            if (existingInput?.value) {
                sp = Number(existingInput.value);
            }
        });
    return sp;
}

function getLoopWidgetProductBundleData(productId) {
    return window.loopProps[productId]?.productBundleData ?? {};
}

function getLoopWidgetBundleVariantInfo(productId, variantId) {
    const productBundleData = getLoopWidgetProductBundleData(productId);
    return productBundleData?.variants?.find(
        (v) => v.shopifyId === Number(variantId)
    );
}

async function loopWidgetCreateBundleTransaction(productId, payload) {
    try {
        const authorization =
            window.loopProps[productId].storeJson.sentinalAuthToken;
        const response = await fetch(
            `${window.loopProps[productId].storeJson.apiUrl.bundleTransaction}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    authorization: authorization,
                },
                body: JSON.stringify(payload),
            }
        );
        const responseJson = await response.json();
        return responseJson.data.transactionId;
    } catch (error) {
        widgetLogger("loopWidgetCreateBundleTransaction", error);
        throw error;
    }
}

function loopWidgetCreateBundleTransactionPayload(
    productId,
    quantity,
    selectedSellingPlanId
) {
    const selectedVariantId = getLoopWidgetVariantId(productId);
    const bundleVariant = getLoopWidgetBundleVariantInfo(
        productId,
        selectedVariantId
    );
    if (!bundleVariant) return { payload: null, bundleVariantDiscount: null };

    const discount = selectedSellingPlanId
        ? bundleVariant.mappedDiscounts.find(
              (d) => d.purchaseType === "SUBSCRIPTION"
          )
        : bundleVariant.mappedDiscounts.find(
              (d) => d.purchaseType !== "SUBSCRIPTION"
          );

    if (!discount) return { payload: null, bundleVariantDiscount: null };

    return {
        payload: {
            presetProductShopifyId: Number(productId),
            presetDiscountId: discount.id,
            presetVariantShopifyId: Number(selectedVariantId),
            totalQuantity: Number(quantity),
            sellingPlanShopifyId: Number(selectedSellingPlanId),
        },
        bundleVariantDiscount: discount,
    };
}

async function handleBundleTransactionLoopWidget(
    productId,
    quantity,
    selectedSellingPlanId
) {
    try {
        const {
            payload,
            bundleVariantDiscount,
        } = loopWidgetCreateBundleTransactionPayload(
            productId,
            quantity,
            selectedSellingPlanId
        );
        if (!payload)
            return { bundleTransactionId: null, bundleVariantDiscount: null };

        const bundleTransactionId = await loopWidgetCreateBundleTransaction(
            productId,
            payload
        );
        if (!bundleTransactionId) enableAddToCartBtnLoop(productId);
        return { bundleTransactionId, bundleVariantDiscount };
    } catch (error) {
        enableAddToCartBtnLoop(productId);
        widgetLogger("handleBundleTransactionLoopWidget", error);
        return { bundleTransactionId: null, bundleVariantDiscount: null };
    }
}

async function getLoopWidgetBundleDiscountAttributes() {
    try {
        const url = `https://${
            window.Shopify.cdnHost.split("/cdn")[0]
        }/cart.json`;
        const res = await (await fetch(url)).json();
        const loopBundleDiscountAttributes = res.attributes
            ?._loopBundleDiscountAttributes
            ? JSON.parse(res.attributes._loopBundleDiscountAttributes)
            : {};

        const bundleIdsInCart = new Set(
            res.items
                .map(
                    (item) =>
                        item.properties?._bundleId ||
                        item.properties?._loopBundleTxnId
                )
                .filter(Boolean)
        );

        return Object.keys(loopBundleDiscountAttributes)
            .filter((key) => bundleIdsInCart.has(key))
            .reduce((obj, key) => {
                obj[key] = loopBundleDiscountAttributes[key];
                return obj;
            }, {});
    } catch (error) {
        widgetLogger("getLoopWidgetBundleDiscountAttributes", error);
        return {};
    }
}

async function loopWidgetCreateAddToCartPayload(
    productId,
    bundleTransactionId,
    bundleVariantDiscount,
    selectedSellingPlanId,
    selectedBundleVariantId,
    quantity,
    productBundleData
) {
    const formData = {
        items: [],
        attributes: {
            _loopBundleDiscountAttributes: {},
        },
    };

    const oldAttr = await getLoopWidgetBundleDiscountAttributes();
    const currentDiscountAttribute = {
        [bundleTransactionId]: {
            discountType: bundleVariantDiscount.type,
            discountValue: bundleVariantDiscount.value,
            discountComputedValue: bundleVariantDiscount
                ? selectedSellingPlanId
                    ? bundleVariantDiscount.sellingPlanComputedDiscounts[
                          selectedSellingPlanId
                      ] *
                      (window.loopProps[productId].storeJson?.preferences
                          ?.presetDummySkuEnabled
                          ? 1
                          : quantity)
                    : bundleVariantDiscount.oneTimeDiscount *
                      (window.loopProps[productId].storeJson?.preferences
                          ?.presetDummySkuEnabled
                          ? 1
                          : quantity)
                : 0,
        },
    };

    formData.attributes._loopBundleDiscountAttributes = JSON.stringify({
        ...oldAttr,
        ...currentDiscountAttribute,
    });

    const selectedBundleVariant = getLoopWidgetBundleVariantInfo(
        productId,
        selectedBundleVariantId
    );
    const selectedBundleVariantProducts =
        selectedBundleVariant?.mappedProductVariants ?? [];

    if (
        window.loopProps[productId].storeJson?.preferences
            ?.presetDummySkuEnabled
    ) {
        const obj = {
            id: selectedBundleVariantId,
            quantity: quantity,
            selling_plan: selectedSellingPlanId,
            properties: {
                _loopBundleTxnId: bundleTransactionId,
                _isPresetBundleProduct: true,
                ...(window.loopProps[productId].storeJson.preferences
                    .showBundleName
                    ? { bundleName: productBundleData.name ?? "" }
                    : { _bundleName: productBundleData.name ?? "" }),
            },
        };
        formData.items.push(obj);
    } else {
        if (selectedBundleVariantProducts.length) {
            selectedBundleVariantProducts.forEach((childProduct) => {
                const obj = {
                    id: childProduct.shopifyId,
                    quantity: childProduct.quantity * quantity,
                    selling_plan: selectedSellingPlanId,
                    properties: {
                        _bundleId: bundleTransactionId,
                        _isPresetBundleProduct: true,
                        ...(window.loopProps[productId].storeJson.preferences
                            .showBundleName
                            ? { bundleName: productBundleData.name ?? "" }
                            : { _bundleName: productBundleData.name ?? "" }),
                    },
                };
                formData.items.push(obj);
            });
        }
    }

    return formData;
}

async function shopifyAddToCartByLoopWidget(payload, productId) {
    const endpoint = `${window.Shopify.routes.root}cart/add.js`;
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        await dispatchLoopWidgetEvent(
            productId,
            "loopPresetAddToCartSuccessEvent",
            data
        );
    } catch (error) {
        widgetLogger("shopifyAddToCartByLoopWidget", error);
        enableAddToCartBtnLoop(productId);
    }
}

function getLoopWidgetVariantId(productId) {
    return Number(window.loopProps[productId].selectedVariantId);
}

async function loopHandleAddToCart(event, productId, quantity = 1) {
    event.preventDefault();
    event.stopPropagation();
    disableAddToCartBtnLoop(productId);

    const bundleVariant = getLoopWidgetBundleVariantInfo(
        productId,
        getLoopWidgetVariantId(productId)
    );
    if (
        !bundleVariant ||
        bundleVariant.outOfStock ||
        bundleVariant.mappedProductVariants.length === 0
    ) {
        return;
    }

    const productBundleData = getLoopWidgetProductBundleData(productId);
    const selectedSellingPlanId = getSelectedSellingPlanLoop(productId);

    const {
        bundleTransactionId,
        bundleVariantDiscount,
    } = await handleBundleTransactionLoopWidget(
        productId,
        quantity,
        selectedSellingPlanId
    );
    if (!bundleTransactionId) {
        return;
    }

    const payload = await loopWidgetCreateAddToCartPayload(
        productId,
        bundleTransactionId,
        bundleVariantDiscount,
        selectedSellingPlanId,
        getLoopWidgetVariantId(productId),
        quantity,
        productBundleData
    );
    await shopifyAddToCartByLoopWidget(payload, productId);
}

async function dispatchLoopWidgetEvent(productId, eventName, response) {
    const addToCartEvent = new CustomEvent(eventName, {
        detail: { productId, response },
    });
    document.dispatchEvent(addToCartEvent);
}

/**
 **************** Bundle Functions Ends ****************
 */

/**
 **************** Prepaid Functions Start ****************
 */

function getFirstVariantPlanFromGroup(variantPlans, groupPlans) {
    const variantIds = variantPlans.map((vp) => vp.selling_plan_id);
    let planToReturn = null;
    for (let i = 0; i < groupPlans.length; i++) {
        const vPlan = groupPlans[i];
        if (variantIds.includes(vPlan.id)) {
            planToReturn = vPlan;
            break;
        }
    }
    if (!planToReturn) {
        planToReturn = groupPlans[0];
    }
    return planToReturn;
}

function updatePrepaidPriceInUILoop({ productId }) {
    const prepaidSellingPlans =
        window.loopProps[productId]["prepaidSellingPlans"];
    if (!window.loopProps[productId]?.prepaidSellingPlans) {
        return;
    }

    let variant = findSelectedVariantLoop(
        productId,
        window.loopProps[productId].selectedVariantId
    );

    let sellingPlan =
        window.loopProps && window.loopProps[productId]
            ? window.loopProps[productId].sellingPlan
            : {};
    const product = window.loopProps[productId]?.product || {};
    const { selling_plan_groups } = product;
    const { selling_plan_allocations } = variant;
    selling_plan_groups.map((spg) => {
        if (Array.isArray(spg.selling_plans) && spg.selling_plans.length) {
            // let firstSellingPlan = spg.selling_plans[0];
            let firstSellingPlan = getFirstVariantPlanFromGroup(
                selling_plan_allocations,
                spg.selling_plans
            );
            if (
                !prepaidSellingPlans[firstSellingPlan.id] ||
                !prepaidSellingPlans[firstSellingPlan.id]?.isPrepaidV2
            ) {
                return;
            }
            const deliveriesPerBillingCycle =
                prepaidSellingPlans[firstSellingPlan.id]
                    ?.deliveriesPerBillingCycle || 1;
            let sellingPlanAllcotion =
                selling_plan_allocations.find(
                    (a) =>
                        Number(a.selling_plan_id) ===
                        Number(firstSellingPlan.id)
                ) || {};
            const {
                selling_plan_group_id,
                per_delivery_price,
            } = sellingPlanAllcotion;
            let element = document.querySelector(
                `#loop-price-${variant.id}-${selling_plan_group_id}`
            );
            if (element) {
                element.innerHTML = loopFormatMoney(
                    per_delivery_price / deliveriesPerBillingCycle,
                    true
                );
            }
        }
    });

    if (sellingPlan && sellingPlan.selling_plan_group_id) {
        const { selling_plan_group_id, per_delivery_price } = sellingPlan;
        if (
            !prepaidSellingPlans[sellingPlan.selling_plan_id] ||
            !prepaidSellingPlans[sellingPlan.selling_plan_id]?.isPrepaidV2
        ) {
            return;
        }
        const deliveriesPerBillingCycle =
            prepaidSellingPlans[sellingPlan.selling_plan_id]
                ?.deliveriesPerBillingCycle || 1;
        let element = document.querySelector(
            `#loop-price-${variant.id}-${selling_plan_group_id}`
        );
        if (element) {
            element.innerHTML = loopFormatMoney(
                per_delivery_price / deliveriesPerBillingCycle,
                true
            );
        }
    }
}

function hideDifferentVariantSellingPlansLoop(productData) {
    productData.variants.forEach((variant) => {
        var sellingPlanIds = variant.selling_plan_allocations.map(
            (allocation) => allocation.selling_plan_id.toString()
        );
        variant.selling_plan_allocations.forEach((allocation) => {
            const selectEle = document.querySelector(
                `#loop-select-${variant.id}-${allocation.selling_plan_group_id}`
            );
            if (selectEle) {
                const options = selectEle.querySelectorAll(
                    "option.loop-selling-plan-selector-option"
                );
                options.forEach(function (option) {
                    if (!sellingPlanIds.includes(option.value)) {
                        option.remove();
                    }
                });
            }
        });
    });
}
/**
 **************** Prepaid Functions Ends ****************
 */
