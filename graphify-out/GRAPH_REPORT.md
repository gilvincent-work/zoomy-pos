# Graph Report - zoomy-pos  (2026-09-02)

## Corpus Check
- 176 files · ~341,255 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 730 nodes · 1350 edges · 66 communities (38 shown, 28 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.8)
- Token cost: 318,409 input · 0 output

## Community Hubs (Navigation)
- Product & Bundle Management
- POS Screens & Cart UI
- Sale Flow & Bundle Builder
- Transactions History UI
- Admin & Payment Modals
- Transaction Data & CSV Export
- Scan-to-Cart Detection UI
- Deployment & Design Decisions
- TF.js Image Classifier
- Package Config & Test Setup
- Cart State (CartContext)
- ML Dataset Generation
- Payments & Import/Export Design Docs
- Expo App Config
- PWA Web Manifest
- Core Feature Plans & Specs
- PWA Manifest Icons
- PWA Service Worker Patch
- Android Permissions
- iOS Config & Permissions
- Camera Dependencies
- TF.js Model JSON Patch
- TF.js Loader (native stub)
- Android Adaptive Icon
- Legacy File-System Shim
- TypeScript Config
- Vercel Config
- EAS & Router Config
- Splash Screen Config
- Brand Icon & Identity
- Web Image Resolver
- Metro Bundler Config
- ML Pipeline Overview
- Crypto Shim
- Font Loading Shim
- expo-constants Dependency
- expo-crypto Dependency
- Document Picker Dependency
- File System Dependency
- Image Picker Dependency
- Linking Dependency
- Media Library Dependency
- Metro Runtime Dependency
- Expo Router Dependency
- Sharing Dependency
- SQLite Dependency
- Status Bar Dependency
- Vector Icons Dependency
- GitHub CLI
- JSZip Dependency
- React Dependency
- React DOM Dependency
- React Native Dependency
- Safe Area Context Dependency
- RN Screens Dependency
- TensorFlow.js Dependency
- TFJS WebGL Backend Dependency
- Project Instructions
- User Guide (PDF)
- Install Guide (PDF)

## God Nodes (most connected - your core abstractions)
1. `getDatabase()` - 49 edges
2. `C` - 21 edges
3. `F` - 20 edges
4. `R` - 19 edges
5. `useCart()` - 16 edges
6. `expo` - 15 edges
7. `ProductsModal()` - 14 edges
8. `OptionHScreen()` - 14 edges
9. `CalendarRangeModal()` - 13 edges
10. `getActiveProducts()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Payment option B — numeric keypad` --semantically_similar_to--> `GCash QR & payment proof implementation plan`  [INFERRED] [semantically similar]
  .superpowers/brainstorm/7173-1776566062/content/payment-screen.html → docs/superpowers/plans/2026-04-19-gcash-proof.md
- `handleExportCatalog()` --calls--> `exportProductsArchive()`  [EXTRACTED]
  app/modals/admin.tsx → utils/export-products-csv.ts
- `handleConfirm()` --calls--> `insertTransaction()`  [EXTRACTED]
  app/modals/payment.tsx → db/transactions.ts
- `Single-screen + modals app architecture` --conceptually_related_to--> `zoomy-pos project overview & features`  [INFERRED]
  .superpowers/brainstorm/7173-1776566062/content/architecture.html → README.md
- `Payment option A — denomination tap buttons` --conceptually_related_to--> `zoomy-pos project overview & features`  [INFERRED]
  .superpowers/brainstorm/7173-1776566062/content/payment-screen.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Payment & checkout flow across brainstorm and plans** — _superpowers_brainstorm_7173_1776566062_content_payment_screen_denomination_buttons, _superpowers_brainstorm_7173_1776566062_content_architecture_sale_flow, docs_option_h_plan_instant_cash, docs_superpowers_plans_2026_04_19_gcash_proof_two_step_flow [INFERRED 0.80]
- **Category/subcategory filtering system** — _superpowers_brainstorm_7173_1776566062_content_mobile_layout_category_filter, docs_option_h_plan_category_tabs, docs_option_h_plan_subcategory_filter, docs_option_h_plan_data_driven_categories [INFERRED 0.85]
- **TF.js + Keras 3 model compatibility fixes** — docs_scan_to_cart_tfjs_keras3_compatibility_model_compat, docs_scan_to_cart_tfjs_keras3_compatibility_bug1_flat_arrays, docs_scan_to_cart_tfjs_keras3_compatibility_bug3_nodeindex, docs_scan_to_cart_tfjs_keras3_compatibility_bug4_depthwise_kernel, docs_scan_to_cart_tfjs_keras3_compatibility_reexport_checklist [EXTRACTED 1.00]
- **ZoomyPOS feature evolution roadmap** — docs_superpowers_plans_2026_04_19_zoomy_pos, docs_superpowers_plans_2026_04_24_product_variants, docs_superpowers_plans_2026_05_06_multi_qr_payments, docs_superpowers_plans_2026_05_11_import_transactions, docs_superpowers_plans_2026_06_25_export_flavor_calendar_payment_fix [INFERRED 0.75]
- **CSV export/import round trip** — docs_superpowers_plans_2026_06_25_export_flavor_calendar_payment_fix_export_shared, docs_superpowers_plans_2026_05_11_import_transactions_csv_parser, docs_superpowers_specs_2026_06_25_export_flavor_calendar_payment_fix_design [INFERRED 0.75]
- **Digital QR payment and proof system** — docs_superpowers_plans_2026_05_06_multi_qr_payments_payment_method_type, docs_superpowers_plans_2026_05_06_multi_qr_payments_qr_settings_api, docs_superpowers_specs_2026_04_19_gcash_proof_design_proof_capture [INFERRED 0.75]

## Communities (66 total, 28 thin omitted)

### Community 0 - "Product & Bundle Management"
Cohesion: 0.05
Nodes (69): handleSavedBundleLongPress(), RootLayout(), bootstrap(), BundleForm, confirmAction(), EMPTY_BUNDLE, EMPTY_PRODUCT, FormMode (+61 more)

### Community 1 - "POS Screens & Cart UI"
Cohesion: 0.05
Nodes (57): styles, styles, OptionHScreen(), Selection, styles, CartPanel(), Props, styles (+49 more)

### Community 2 - "Sale Flow & Bundle Builder"
Cohesion: 0.06
Nodes (42): POSScreen(), handleProductPress(), BundleModal(), buildBundleItems(), handleAddToCart(), handleSaveConfirm(), handleProductPress(), getActiveProducts() (+34 more)

### Community 3 - "Transactions History UI"
Cohesion: 0.07
Nodes (36): DATE_FILTERS, Dropdown(), DropdownOption, getMethodDisplayName(), METHOD_FILTERS, MethodFilter, PhotoViewer(), styles (+28 more)

### Community 4 - "Admin & Payment Modals"
Cohesion: 0.08
Nodes (36): AdminModal(), confirmAction(), formatImportSummary(), handleExportCatalog(), handleImportCatalog(), handleKey(), handlePickQr(), handleRemoveQr() (+28 more)

### Community 5 - "Transaction Data & CSV Export"
Cohesion: 0.13
Nodes (27): getAllTransactions(), importTransaction(), InsertItem, insertTransaction(), Transaction, transactionExists(), TransactionItem, voidTransaction() (+19 more)

### Community 6 - "Scan-to-Cart Detection UI"
Cohesion: 0.11
Nodes (22): Phase, ScanModal(), handleCapture(), styles, BOX_COLORS, DetectionResultsSheet(), Props, styles (+14 more)

### Community 7 - "Deployment & Design Decisions"
Cohesion: 0.07
Nodes (33): Preview deployment URL PR comment, Staging deployment alias (zoomy-pos-staging.vercel.app), Resolve target environment (main=production, else preview), Deploy to Vercel GitHub Actions workflow, Single-screen + modals app architecture, Sale flow (tap tile, charge, denominations, confirm), SQLite data model (products, transactions, transaction_items, settings), Mobile layout option C — tiles + category filter bar (+25 more)

### Community 8 - "TF.js Image Classifier"
Cohesion: 0.08
Nodes (8): DetectionResult, GlobalAveragePooling2DKeepdims, HardSilu, loadClassifier(), RescalingLayer, ScalarAdd, ScalarMultiply, withTimeout()

### Community 9 - "Package Config & Test Setup"
Cohesion: 0.07
Nodes (27): babel-preset-expo, jest, jest-expo, devDependencies, babel-preset-expo, jest, jest-expo, @testing-library/jest-native (+19 more)

### Community 10 - "Cart State (CartContext)"
Cohesion: 0.12
Nodes (17): handleInstantCash(), CartAction, CartBundle, CartContext, CartContextValue, CartItem, CartProvider(), cartReducer() (+9 more)

### Community 11 - "ML Dataset Generation"
Cohesion: 0.24
Nodes (15): Image, augment_product(), box_iou(), generate_scene(), generate_split(), load_products(), main(), make_background() (+7 more)

### Community 12 - "Payments & Import/Export Design Docs"
Cohesion: 0.19
Nodes (14): Multi-QR Payment Methods Implementation Plan, PaymentMethod type (cash/gcash/maya/bpi), Multi-QR settings API (getQrUri/setQrUri/getAllQrUris), Import Transactions Implementation Plan, processCSV importer, Export Flavor Column, Custom Date Range, Payment Fix Plan, CalendarRangeModal date-range picker, date-range pure helpers (+6 more)

### Community 13 - "Expo App Config"
Cohesion: 0.15
Nodes (12): expo, assetBundlePatterns, icon, name, orientation, plugins, scheme, slug (+4 more)

### Community 14 - "PWA Web Manifest"
Cohesion: 0.18
Nodes (11): web, backgroundColor, bundler, description, display, favicon, name, orientation (+3 more)

### Community 15 - "Core Feature Plans & Specs"
Cohesion: 0.29
Nodes (11): ZoomyPOS Implementation Plan, Product Variants Implementation Plan, ZoomyPOS Design Spec, CartContext useReducer cart state, POSScreen tile grid, SQLite data model (products, transactions, transaction_items, settings), Product Variants/Flavors Feature Design, product_variants table and composite-key cart items (+3 more)

### Community 16 - "PWA Manifest Icons"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 17 - "PWA Service Worker Patch"
Cohesion: 0.22
Nodes (8): distDir, fs, { generateSW }, html, iconDest, iconSrc, indexPath, path

### Community 18 - "Android Permissions"
Cohesion: 0.25
Nodes (8): permissions, android.permission.READ_EXTERNAL_STORAGE, android.permission.READ_MEDIA_AUDIO, android.permission.READ_MEDIA_IMAGES, android.permission.READ_MEDIA_VIDEO, android.permission.READ_MEDIA_VISUAL_USER_SELECTED, android.permission.RECORD_AUDIO, android.permission.WRITE_EXTERNAL_STORAGE

### Community 19 - "iOS Config & Permissions"
Cohesion: 0.25
Nodes (8): ios, NSCameraUsageDescription, NSMicrophoneUsageDescription, NSPhotoLibraryUsageDescription, bundleIdentifier, icon, infoPlist, supportsTablet

### Community 20 - "Camera Dependencies"
Cohesion: 0.29
Nodes (7): expo, expo-camera, dependencies, expo, expo-camera, react-native-web, react-native-web

### Community 21 - "TF.js Model JSON Patch"
Cohesion: 0.40
Nodes (5): fix_nested_io(), patch(), Path, Run after every Colab export, before copying tfjs_model/ into public/ml-model/.…, Wrap flat input_layers / output_layers in an extra list (Fix 1 & 2).

### Community 22 - "TF.js Loader (native stub)"
Cohesion: 0.33
Nodes (5): browser, dispose, loadLayersModel, mockPredict, ready

### Community 23 - "Android Adaptive Icon"
Cohesion: 0.40
Nodes (5): backgroundColor, foregroundImage, adaptiveIcon, package, android

### Community 24 - "Legacy File-System Shim"
Cohesion: 0.40
Nodes (4): copyAsync, deleteAsync, documentDirectory, getInfoAsync

### Community 25 - "TypeScript Config"
Cohesion: 0.40
Nodes (4): expo/tsconfig.base, compilerOptions, strict, extends

### Community 26 - "Vercel Config"
Cohesion: 0.40
Nodes (4): buildCommand, headers, outputDirectory, rewrites

### Community 27 - "EAS & Router Config"
Cohesion: 0.50
Nodes (4): projectId, extra, eas, router

### Community 28 - "Splash Screen Config"
Cohesion: 0.50
Nodes (4): splash, backgroundColor, image, resizeMode

### Community 29 - "Brand Icon & Identity"
Cohesion: 0.67
Nodes (4): Pet Cat/Dog Face Mascot, Red Rounded Wordmark, Zoomy! POS Brand Identity, Zoomy! POS Brand Icon

### Community 30 - "Web Image Resolver"
Cohesion: 0.67
Nodes (3): makeImageResolver(), mimeFor(), ResolveImage

### Community 32 - "ML Pipeline Overview"
Cohesion: 1.00
Nodes (3): Zoomy POS ML Training Pipeline README, Scan-to-Cart feature, YOLOv8-nano 24-class product detector

## Knowledge Gaps
- **241 isolated node(s):** `mockPredict`, `ready`, `loadLayersModel`, `browser`, `dispose` (+236 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo` connect `Expo App Config` to `PWA Web Manifest`, `iOS Config & Permissions`, `Android Adaptive Icon`, `EAS & Router Config`, `Splash Screen Config`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `expo-router` connect `Admin & Payment Modals` to `Product & Bundle Management`, `POS Screens & Cart UI`, `Transactions History UI`, `Scan-to-Cart Detection UI`, `Expo App Config`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `plugins` connect `Expo App Config` to `Admin & Payment Modals`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **What connects `mockPredict`, `ready`, `loadLayersModel` to the rest of the system?**
  _241 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Product & Bundle Management` be split into smaller, more focused modules?**
  _Cohesion score 0.05220883534136546 - nodes in this community are weakly interconnected._
- **Should `POS Screens & Cart UI` be split into smaller, more focused modules?**
  _Cohesion score 0.054069938289744345 - nodes in this community are weakly interconnected._
- **Should `Sale Flow & Bundle Builder` be split into smaller, more focused modules?**
  _Cohesion score 0.06464646464646465 - nodes in this community are weakly interconnected._