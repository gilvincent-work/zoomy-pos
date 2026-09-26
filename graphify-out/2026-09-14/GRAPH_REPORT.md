# Graph Report - zoomy-pos  (2026-09-08)

## Corpus Check
- Large corpus: 737 files · ~1,775,007 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 907 nodes · 1850 edges · 85 communities (47 shown, 38 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.8)
- Token cost: 98,472 input · 0 output

## Community Hubs (Navigation)
- POS Home Screen & Checkout
- Bundle Builder
- Root Layout & Theming
- Sync Status & Install Prompt
- Transactions History
- Admin & Catalog Import
- Products & Bundles Data
- Scan Modal & Detection
- Jest Test Config
- Web Image Classifier
- SQLite Transactions DB
- POS Screen Interactions
- Cart Context
- POS Supabase Schema
- Cart & Category UI (design)
- ML Dataset Generation
- Expo App Config
- Engineering & Design Principles
- CSV Export
- Payment/Import Feature Plans
- Android Config
- Web Manifest Config
- Implementation Plans & Specs
- PWA Manifest
- PWA Patch Script
- iOS Config
- PWA Install Prompt
- Expo & Camera Deps
- ML Model JSON Patch
- TFJS Loader
- Legacy File-System Helper
- TypeScript Config
- Vercel Config
- EAS Config
- Splash Config
- Brand Assets
- Brand Identity (Mascot/Wordmark)
- Web Image Import
- Testing Principles
- Commit & Branch Conventions
- Metro Config
- ML Training Pipeline
- Expo Crypto Helper
- Expo Font Helper
- Coupling Principles
- SOLID & Separation
- expo-constants
- expo-crypto (dep)
- expo-document-picker
- expo-file-system
- expo-image-picker
- expo-linking
- expo-media-library
- metro-runtime
- expo-router (dep)
- expo-sharing
- expo-sqlite (dep)
- expo-status-bar
- vector-icons
- gh CLI
- jszip
- react
- react-native
- safe-area-context
- react-native-screens
- react-native-web
- supabase-js
- tensorflow tfjs
- tfjs webgl backend
- Boy Scout Rule
- Composition over Inheritance
- Fail Fast
- KISS
- Least Astonishment
- No Em/En-Dashes Rule
- Single Level of Abstraction
- ZoomyPOS Guide PDF
- Install Guide PDF
- CSV ZIP Format

## God Nodes (most connected - your core abstractions)
1. `getDatabase()` - 68 edges
2. `useTheme()` - 51 edges
3. `Palette` - 25 edges
4. `F` - 24 edges
5. `R` - 22 edges
6. `POSScreen()` - 20 edges
7. `ProductsModal()` - 19 edges
8. `expo` - 16 edges
9. `BundleSelectModal()` - 16 edges
10. `CalendarRangeModal()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `ThemedStack()` --calls--> `useTheme()`  [EXTRACTED]
  app/_layout.tsx → context/ThemeContext.tsx
- `handleProductPress()` --calls--> `getVariantsByProductId()`  [EXTRACTED]
  app/index.tsx → db/products.ts
- `Option H — split-view POS with category filters` --references--> `Project structure (app/ components/ db/ utils/)`  [INFERRED]
  docs/OPTION_H_PLAN.md → README.md
- `POSScreen()` --calls--> `useToast()`  [EXTRACTED]
  app/index.tsx → components/Toast.tsx
- `POSScreen()` --calls--> `useCart()`  [EXTRACTED]
  app/index.tsx → context/CartContext.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Payment & checkout flow across brainstorm and plans** — docs_option_h_plan_instant_cash, docs_superpowers_plans_2026_04_19_gcash_proof_two_step_flow [INFERRED 0.80]
- **Category/subcategory filtering system** — docs_option_h_plan_category_tabs, docs_option_h_plan_subcategory_filter, docs_option_h_plan_data_driven_categories [INFERRED 0.85]
- **TF.js + Keras 3 model compatibility fixes** — docs_scan_to_cart_tfjs_keras3_compatibility_model_compat, docs_scan_to_cart_tfjs_keras3_compatibility_bug1_flat_arrays, docs_scan_to_cart_tfjs_keras3_compatibility_bug3_nodeindex, docs_scan_to_cart_tfjs_keras3_compatibility_bug4_depthwise_kernel, docs_scan_to_cart_tfjs_keras3_compatibility_reexport_checklist [EXTRACTED 1.00]
- **ZoomyPOS feature evolution roadmap** — docs_superpowers_plans_2026_04_19_zoomy_pos, docs_superpowers_plans_2026_04_24_product_variants, docs_superpowers_plans_2026_05_06_multi_qr_payments, docs_superpowers_plans_2026_05_11_import_transactions, docs_superpowers_plans_2026_06_25_export_flavor_calendar_payment_fix [INFERRED 0.75]
- **Digital QR payment and proof system** — docs_superpowers_plans_2026_05_06_multi_qr_payments_payment_method_type, docs_superpowers_plans_2026_05_06_multi_qr_payments_qr_settings_api, docs_superpowers_specs_2026_04_19_gcash_proof_design_proof_capture [INFERRED 0.75]
- **CSV export/import round trip** — docs_superpowers_plans_2026_06_25_export_flavor_calendar_payment_fix_export_shared, docs_superpowers_plans_2026_05_11_import_transactions_csv_parser, docs_superpowers_specs_2026_06_25_export_flavor_calendar_payment_fix_design [INFERRED 0.75]
- **Design skills for UI work** — claude_emil_design_eng, claude_impeccable, claude_design_taste_frontend [EXTRACTED 1.00]
- **Knowledge graph artifacts in graphify-out** — claude_graph_json, claude_graph_report, claude_graph_html [EXTRACTED 1.00]

## Communities (85 total, 38 thin omitted)

### Community 0 - "POS Home Screen & Checkout"
Cohesion: 0.06
Nodes (60): handleConfirmPay(), Selection, BundleTile(), makeStyles(), Props, CartPanel(), makeStyles(), Props (+52 more)

### Community 1 - "Bundle Builder"
Cohesion: 0.06
Nodes (63): BundleModal(), handleSave(), makeStyles(), buildSections(), BundleSelectModal(), handleAdd(), makeStyles(), Section (+55 more)

### Community 2 - "Root Layout & Theming"
Cohesion: 0.07
Nodes (52): RootLayout(), sleep(), ThemedStack(), withTimeout(), handleConfirm(), ThemeMode, ThemeProvider(), ImportSummary (+44 more)

### Community 3 - "Sync Status & Install Prompt"
Cohesion: 0.07
Nodes (36): makeStyles(), SyncStatusBar(), useInstallPrompt(), useSyncStatus(), getSupabase(), isSupabaseConfigured(), InsertItem, CatalogUpdate (+28 more)

### Community 4 - "Transactions History"
Cohesion: 0.07
Nodes (35): DATE_FILTERS, Dropdown(), DropdownOption, getMethodDisplayName(), makeStyles(), METHOD_FILTERS, MethodFilter, PhotoViewer() (+27 more)

### Community 5 - "Admin & Catalog Import"
Cohesion: 0.08
Nodes (36): AdminModal(), confirmAction(), formatImportSummary(), handleImportCatalog(), handleKey(), handlePickQr(), handleRemoveQr(), handleSubmit() (+28 more)

### Community 6 - "Products & Bundles Data"
Cohesion: 0.09
Nodes (35): handleExportCatalog(), getActiveProducts(), getVariantsByProductId(), Product, ProductVariant, getSavedBundles(), EXT, LEGACY (+27 more)

### Community 7 - "Scan Modal & Detection"
Cohesion: 0.11
Nodes (22): makeStyles(), Phase, ScanModal(), handleCapture(), BOX_COLORS, DetectionResultsSheet(), makeStyles(), Props (+14 more)

### Community 8 - "Jest Test Config"
Cohesion: 0.06
Nodes (31): babel-preset-expo, jest, jest-expo, devDependencies, babel-preset-expo, jest, jest-expo, @testing-library/jest-native (+23 more)

### Community 9 - "Web Image Classifier"
Cohesion: 0.08
Nodes (8): DetectionResult, GlobalAveragePooling2DKeepdims, HardSilu, loadClassifier(), RescalingLayer, ScalarAdd, ScalarMultiply, withTimeout()

### Community 10 - "SQLite Transactions DB"
Cohesion: 0.16
Nodes (17): importTransaction(), transactionExists(), voidTransaction(), mockDb, openDatabaseAsync, mockProduct, mockExists, mockImport (+9 more)

### Community 11 - "POS Screen Interactions"
Cohesion: 0.13
Nodes (16): makeStyles(), POSScreen(), handleProductPress(), CategoryGroup, UNCATEGORIZED, ALL, beef, GROUPS (+8 more)

### Community 12 - "Cart Context"
Cohesion: 0.14
Nodes (15): CartAction, CartBundle, CartContext, CartContextValue, CartItem, CartProvider(), cartReducer(), CartState (+7 more)

### Community 13 - "POS Supabase Schema"
Cohesion: 0.19
Nodes (15): public.apply_pos_order(), public.pos_bundle_items, public.pos_bundles, public.pos_inventory, public.pos_inventory_lots, public.pos_order_items, public.pos_orders, public.pos_price_changes (+7 more)

### Community 14 - "Cart & Category UI (design)"
Cohesion: 0.13
Nodes (19): CartPanel shared cart UI (landscape + portrait), CartSheet slide-up bottom sheet (portrait), CategoryTabs component (data-driven top tabs), Data-driven categories from SKU sheet (getCategoriesWithSubcategories), One-tap instant cash checkout (locked decision), Option H — split-view POS with category filters, SubcategoryFilter component (conditional second row), Bug 1/2 — flat input_layers/output_layers arrays (+11 more)

### Community 15 - "ML Dataset Generation"
Cohesion: 0.24
Nodes (15): Image, augment_product(), box_iou(), generate_scene(), generate_split(), load_products(), main(), make_background() (+7 more)

### Community 16 - "Expo App Config"
Cohesion: 0.13
Nodes (14): typedRoutes, expo, assetBundlePatterns, experiments, icon, name, orientation, plugins (+6 more)

### Community 17 - "Engineering & Design Principles"
Cohesion: 0.13
Nodes (15): Avoid Premature Optimization, design-taste-frontend skill, DRY, emil-design-eng skill, Expo / React Native, graph.html, graph.json, GRAPH_REPORT.md (+7 more)

### Community 18 - "CSV Export"
Cohesion: 0.42
Nodes (9): Transaction, exportTransactionsZip(), buildItemRows(), EXPORT_HEADER, formatPaymentMethod(), formatTime(), proofFileName(), exportTransactionsZip() (+1 more)

### Community 19 - "Payment/Import Feature Plans"
Cohesion: 0.19
Nodes (14): Multi-QR Payment Methods Implementation Plan, PaymentMethod type (cash/gcash/maya/bpi), Multi-QR settings API (getQrUri/setQrUri/getAllQrUris), Import Transactions Implementation Plan, processCSV importer, Export Flavor Column, Custom Date Range, Payment Fix Plan, CalendarRangeModal date-range picker, date-range pure helpers (+6 more)

### Community 20 - "Android Config"
Cohesion: 0.15
Nodes (13): backgroundColor, foregroundImage, adaptiveIcon, package, permissions, android, android.permission.READ_EXTERNAL_STORAGE, android.permission.READ_MEDIA_AUDIO (+5 more)

### Community 21 - "Web Manifest Config"
Cohesion: 0.18
Nodes (11): web, backgroundColor, bundler, description, display, favicon, name, orientation (+3 more)

### Community 22 - "Implementation Plans & Specs"
Cohesion: 0.29
Nodes (11): ZoomyPOS Implementation Plan, Product Variants Implementation Plan, ZoomyPOS Design Spec, CartContext useReducer cart state, POSScreen tile grid, SQLite data model (products, transactions, transaction_items, settings), Product Variants/Flavors Feature Design, product_variants table and composite-key cart items (+3 more)

### Community 23 - "PWA Manifest"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 24 - "PWA Patch Script"
Cohesion: 0.22
Nodes (8): distDir, fs, { generateSW }, html, iconDest, iconSrc, indexPath, path

### Community 25 - "iOS Config"
Cohesion: 0.25
Nodes (8): ios, NSCameraUsageDescription, NSMicrophoneUsageDescription, NSPhotoLibraryUsageDescription, bundleIdentifier, icon, infoPlist, supportsTablet

### Community 26 - "PWA Install Prompt"
Cohesion: 0.29
Nodes (4): BeforeInstallPromptEvent, listeners, notify(), promptInstall()

### Community 27 - "Expo & Camera Deps"
Cohesion: 0.29
Nodes (7): expo, expo-camera, dependencies, expo, expo-camera, react-dom, react-dom

### Community 28 - "ML Model JSON Patch"
Cohesion: 0.40
Nodes (5): fix_nested_io(), patch(), Path, Run after every Colab export, before copying tfjs_model/ into public/ml-model/.…, Wrap flat input_layers / output_layers in an extra list (Fix 1 & 2).

### Community 29 - "TFJS Loader"
Cohesion: 0.33
Nodes (5): browser, dispose, loadLayersModel, mockPredict, ready

### Community 30 - "Legacy File-System Helper"
Cohesion: 0.40
Nodes (4): copyAsync, deleteAsync, documentDirectory, getInfoAsync

### Community 31 - "TypeScript Config"
Cohesion: 0.40
Nodes (4): expo/tsconfig.base, compilerOptions, strict, extends

### Community 32 - "Vercel Config"
Cohesion: 0.40
Nodes (4): buildCommand, headers, outputDirectory, rewrites

### Community 33 - "EAS Config"
Cohesion: 0.50
Nodes (4): projectId, extra, eas, router

### Community 34 - "Splash Config"
Cohesion: 0.50
Nodes (4): splash, backgroundColor, image, resizeMode

### Community 35 - "Brand Assets"
Cohesion: 0.83
Nodes (4): ZoomyPOS Adaptive Icon, ZoomyPOS Favicon, ZoomyPOS Splash Icon, Zoomy! POS Brand Logo

### Community 36 - "Brand Identity (Mascot/Wordmark)"
Cohesion: 0.67
Nodes (4): Pet Cat/Dog Face Mascot, Red Rounded Wordmark, Zoomy! POS Brand Identity, Zoomy! POS Brand Icon

### Community 37 - "Web Image Import"
Cohesion: 0.67
Nodes (3): makeImageResolver(), mimeFor(), ResolveImage

### Community 38 - "Testing Principles"
Cohesion: 0.67
Nodes (3): AAA (Arrange-Act-Assert), TDD / Test-First, Test Pyramid

### Community 39 - "Commit & Branch Conventions"
Cohesion: 0.67
Nodes (3): Atomic Commits, Branch Flow (feature to develop to staging to main), Conventional Commits

### Community 41 - "ML Training Pipeline"
Cohesion: 1.00
Nodes (3): Zoomy POS ML Training Pipeline README, Scan-to-Cart feature, YOLOv8-nano 24-class product detector

## Knowledge Gaps
- **254 isolated node(s):** `mockPredict`, `ready`, `loadLayersModel`, `browser`, `dispose` (+249 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTheme()` connect `POS Home Screen & Checkout` to `Bundle Builder`, `Root Layout & Theming`, `Sync Status & Install Prompt`, `Transactions History`, `Admin & Catalog Import`, `Scan Modal & Detection`, `POS Screen Interactions`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `expo` connect `Expo App Config` to `EAS Config`, `Splash Config`, `Android Config`, `Web Manifest Config`, `iOS Config`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `plugins` connect `Expo App Config` to `Admin & Catalog Import`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **What connects `mockPredict`, `ready`, `loadLayersModel` to the rest of the system?**
  _254 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `POS Home Screen & Checkout` be split into smaller, more focused modules?**
  _Cohesion score 0.06415396952686447 - nodes in this community are weakly interconnected._
- **Should `Bundle Builder` be split into smaller, more focused modules?**
  _Cohesion score 0.055944055944055944 - nodes in this community are weakly interconnected._
- **Should `Root Layout & Theming` be split into smaller, more focused modules?**
  _Cohesion score 0.06923076923076923 - nodes in this community are weakly interconnected._