// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "xim-swiftsignpost",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "xim-swiftsignpost", targets: ["xim-swiftsignpost"])
    ],
    dependencies: [
        .package(url: "https://github.com/swiftlang/swift-syntax.git", from: "602.0.0")
    ],
    targets: [
        .executableTarget(
            name: "xim-swiftsignpost",
            dependencies: [
                .product(name: "SwiftParser", package: "swift-syntax"),
                .product(name: "SwiftSyntax", package: "swift-syntax"),
                .product(name: "SwiftParserDiagnostics", package: "swift-syntax")
            ]
        )
    ]
)
