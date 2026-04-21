import Foundation
import SwiftParser
import SwiftParserDiagnostics
import SwiftSyntax

struct InventoryDeclaration: Codable {
    let id: String
    let kind: String
    let filePath: String
    let line: Int
    let column: Int
    let baseName: String
    let containerName: String?
    let signpostName: String
}

struct InventoryResponse: Codable {
    let files: [String]
    let declarations: [InventoryDeclaration]
}

struct ApplyTarget: Codable {
    let declarationId: String
    let signpostName: String
}

struct ApplyRequest: Codable {
    let subsystem: String
    let category: String
    let targets: [ApplyTarget]
}

struct ApplyResponse: Codable {
    let modifiedSource: String
    let appliedDeclarationIds: [String]
    let skippedDeclarationIds: [String]
    let diagnostics: [String]
}

struct DeclarationEdit {
    let id: String
    let bodyInsertOffset: Int
    let indentation: String
    let signpostName: String
    let bodyText: String
}

struct ParsedDeclaration {
    let declaration: InventoryDeclaration
    let bodyInsertOffset: Int
    let indentation: String
    let bodyText: String
}

@main
enum XimSwiftSignpost {
    static func main() throws {
        var arguments = Array(CommandLine.arguments.dropFirst())
        guard let command = arguments.first else {
            throw Failure("Missing command. Expected inventory or apply.")
        }
        arguments.removeFirst()

        switch command {
        case "inventory":
            let options = try parseOptions(arguments)
            let filePaths = try collectSwiftFiles(options: options)
            let declarations = try filePaths.flatMap { try inventoryFile(filePath: $0, projectRoot: options["project-root"] ?? URL(fileURLWithPath: $0).deletingLastPathComponent().path) }
            try writeJSON(InventoryResponse(files: filePaths, declarations: declarations))
        case "apply":
            let options = try parseOptions(arguments)
            guard let filePath = options["file"] else {
                throw Failure("apply requires --file <path>.")
            }
            guard let targetsPath = options["targets-file"] else {
                throw Failure("apply requires --targets-file <path>.")
            }
            let request = try JSONDecoder().decode(ApplyRequest.self, from: Data(contentsOf: URL(fileURLWithPath: targetsPath)))
            let normalizedFilePath = URL(fileURLWithPath: filePath).standardized.path
            let response = try apply(filePath: normalizedFilePath, request: request)
            try writeJSON(response)
        default:
            throw Failure("Unsupported command \(command).")
        }
    }

    static func parseOptions(_ arguments: [String]) throws -> [String: String] {
        var options: [String: String] = [:]
        var index = 0
        while index < arguments.count {
            let argument = arguments[index]
            guard argument.hasPrefix("--") else {
                throw Failure("Unexpected positional argument \(argument).")
            }
            let key = String(argument.dropFirst(2))
            let valueIndex = index + 1
            guard valueIndex < arguments.count else {
                throw Failure("Missing value for \(argument).")
            }
            options[key] = arguments[valueIndex]
            index += 2
        }
        return options
    }

    static func collectSwiftFiles(options: [String: String]) throws -> [String] {
        if let filePath = options["file"] {
            return [URL(fileURLWithPath: filePath).standardized.path]
        }
        guard let projectRoot = options["project-root"] else {
            throw Failure("inventory requires --project-root <path> or --file <path>.")
        }
        let rootURL = URL(fileURLWithPath: projectRoot)
        let enumerator = FileManager.default.enumerator(at: rootURL, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles])
        var files: [String] = []
        while let fileURL = enumerator?.nextObject() as? URL {
            let path = fileURL.path
            if path.contains("/.build/") || path.contains("/build/") || path.contains("/DerivedData/") || path.contains("/Pods/") || path.contains("/Carthage/") || path.contains("/Tests/") {
                continue
            }
            if fileURL.pathExtension == "swift" {
                files.append(fileURL.standardized.path)
            }
        }
        return files.sorted()
    }

    static func inventoryFile(filePath: String, projectRoot: String) throws -> [InventoryDeclaration] {
        let source = try String(contentsOfFile: filePath, encoding: .utf8)
        let file = Parser.parse(source: source)
        let converter = SourceLocationConverter(fileName: filePath, tree: file)
        let collector = DeclarationCollector(source: source, filePath: filePath, projectRoot: projectRoot, converter: converter)
        collector.walk(file)
        return collector.declarations.map(\.declaration)
    }

    static func apply(filePath: String, request: ApplyRequest) throws -> ApplyResponse {
        let source = try String(contentsOfFile: filePath, encoding: .utf8)
        let file = Parser.parse(source: source)
        let converter = SourceLocationConverter(fileName: filePath, tree: file)
        let collector = DeclarationCollector(source: source, filePath: filePath, projectRoot: URL(fileURLWithPath: filePath).deletingLastPathComponent().path, converter: converter)
        collector.walk(file)

        let targetsById = Dictionary(uniqueKeysWithValues: request.targets.map { ($0.declarationId, $0.signpostName) })
        let targetsByName = Dictionary(uniqueKeysWithValues: request.targets.map { ($0.signpostName, $0.signpostName) })
        let declarations = collector.declarations.filter {
            targetsById[$0.declaration.id] != nil || targetsByName[$0.declaration.signpostName] != nil
        }
        var skipped: [String] = []
        var edits: [(offset: Int, text: String)] = []

        for declaration in declarations.sorted(by: { $0.bodyInsertOffset > $1.bodyInsertOffset }) {
            guard let signpostName = targetsById[declaration.declaration.id] ?? targetsByName[declaration.declaration.signpostName] else {
                continue
            }
            if declaration.bodyText.contains("// xcodeinstrumentmcp:begin") {
                skipped.append(declaration.declaration.id)
                continue
            }
            let instrumentation = instrumentBlock(indentation: declaration.indentation, signpostName: signpostName)
            edits.append((offset: declaration.bodyInsertOffset, text: instrumentation))
        }

        var modified = source
        if !source.contains("import OSLog") {
            edits.append((offset: 0, text: "import OSLog\n"))
        }
        if !source.contains("private let __ximSignposter = OSSignposter(") {
            let insertionOffset = helperInsertionOffset(source: source)
            let helperDecl = "\nprivate let __ximSignposter = OSSignposter(subsystem: \"\(escapeString(request.subsystem))\", category: \"\(escapeString(request.category))\")\n"
            edits.append((offset: insertionOffset, text: helperDecl))
        }

        for edit in edits.sorted(by: { $0.offset > $1.offset }) {
            let index = modified.index(modified.startIndex, offsetBy: edit.offset)
            modified.insert(contentsOf: edit.text, at: index)
        }

        let diagnostics = ParseDiagnosticsGenerator.diagnostics(for: Parser.parse(source: modified)).map { "\($0.diagMessage)" }
        return ApplyResponse(
            modifiedSource: modified,
            appliedDeclarationIds: declarations.map(\.declaration.id).filter { !skipped.contains($0) },
            skippedDeclarationIds: skipped,
            diagnostics: diagnostics
        )
    }

    static func helperInsertionOffset(source: String) -> Int {
        let lines = source.split(separator: "\n", omittingEmptySubsequences: false)
        var offset = 0
        var lastImportLineOffset = 0
        for line in lines {
            let text = String(line)
            if text.trimmingCharacters(in: .whitespaces).hasPrefix("import ") {
                lastImportLineOffset = offset + text.count + 1
            }
            offset += text.count + 1
        }
        return lastImportLineOffset
    }

    static func instrumentBlock(indentation: String, signpostName: String) -> String {
        let inner = indentation + "    "
        let escapedName = escapeString(signpostName)
        return "\n\(inner)// xcodeinstrumentmcp:begin\n\(inner)let __ximState = __ximSignposter.beginInterval(\"\(escapedName)\")\n\(inner)defer { __ximSignposter.endInterval(\"\(escapedName)\", __ximState) }\n\(inner)// xcodeinstrumentmcp:end"
    }

    static func escapeString(_ value: String) -> String {
        value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    }

    static func writeJSON<T: Encodable>(_ value: T) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(value)
        FileHandle.standardOutput.write(data)
    }
}

final class DeclarationCollector: SyntaxVisitor {
    private let source: String
    private let filePath: String
    private let projectRoot: String
    private let converter: SourceLocationConverter
    private var containerStack: [String] = []
    private(set) var declarations: [ParsedDeclaration] = []

    init(source: String, filePath: String, projectRoot: String, converter: SourceLocationConverter) {
        self.source = source
        self.filePath = filePath
        self.projectRoot = projectRoot
        self.converter = converter
        super.init(viewMode: .sourceAccurate)
    }

    override func visit(_ node: ClassDeclSyntax) -> SyntaxVisitorContinueKind {
        containerStack.append(node.name.text)
        return .visitChildren
    }

    override func visitPost(_ node: ClassDeclSyntax) {
        _ = containerStack.popLast()
    }

    override func visit(_ node: StructDeclSyntax) -> SyntaxVisitorContinueKind {
        containerStack.append(node.name.text)
        return .visitChildren
    }

    override func visitPost(_ node: StructDeclSyntax) {
        _ = containerStack.popLast()
    }

    override func visit(_ node: EnumDeclSyntax) -> SyntaxVisitorContinueKind {
        containerStack.append(node.name.text)
        return .visitChildren
    }

    override func visitPost(_ node: EnumDeclSyntax) {
        _ = containerStack.popLast()
    }

    override func visit(_ node: ActorDeclSyntax) -> SyntaxVisitorContinueKind {
        containerStack.append(node.name.text)
        return .visitChildren
    }

    override func visitPost(_ node: ActorDeclSyntax) {
        _ = containerStack.popLast()
    }

    override func visit(_ node: ExtensionDeclSyntax) -> SyntaxVisitorContinueKind {
        containerStack.append(node.extendedType.trimmedDescription)
        return .visitChildren
    }

    override func visitPost(_ node: ExtensionDeclSyntax) {
        _ = containerStack.popLast()
    }

    override func visit(_ node: FunctionDeclSyntax) -> SyntaxVisitorContinueKind {
        guard let body = node.body else { return .skipChildren }
        appendDeclaration(kind: "function", baseName: node.name.text, body: body)
        return .skipChildren
    }

    override func visit(_ node: InitializerDeclSyntax) -> SyntaxVisitorContinueKind {
        guard let body = node.body else { return .skipChildren }
        appendDeclaration(kind: "initializer", baseName: "init", body: body)
        return .skipChildren
    }

    override func visit(_ node: DeinitializerDeclSyntax) -> SyntaxVisitorContinueKind {
        guard let body = node.body else { return .skipChildren }
        appendDeclaration(kind: "deinitializer", baseName: "deinit", body: body)
        return .skipChildren
    }

    private func appendDeclaration(kind: String, baseName: String, body: CodeBlockSyntax) {
        let position = body.leftBrace.endPositionBeforeTrailingTrivia
        let location = converter.location(for: position)
        let line = location.line ?? 1
        let column = location.column ?? 1
        let lineStartIndex = sourceLineStartIndex(line: line)
        let braceColumn = max(column - 1, 0)
        let lineText = currentLineText(line: line)
        let prefixText = String(lineText.prefix(braceColumn))
        let leadingSpaces = String(prefixText.prefix { character in
            character == " " || character == "\t"
        })
        let containerName = containerStack.last
        let projectName = URL(fileURLWithPath: projectRoot).lastPathComponent
        let signpostName = containerName.map { "\($0).\(baseName)" } ?? "\(projectName).\(baseName)"
        let declaration = InventoryDeclaration(
            id: "\(filePath)::\(signpostName)",
            kind: kind,
            filePath: filePath,
            line: line,
            column: column,
            baseName: baseName,
            containerName: containerName,
            signpostName: signpostName
        )
        declarations.append(
            ParsedDeclaration(
                declaration: declaration,
                bodyInsertOffset: position.utf8Offset,
                indentation: leadingSpaces,
                bodyText: body.description
            )
        )
    }

    private func sourceLineStartIndex(line: Int) -> String.Index {
        var currentLine = 1
        var index = source.startIndex
        while currentLine < line && index < source.endIndex {
            if source[index] == "\n" {
                currentLine += 1
            }
            index = source.index(after: index)
        }
        return index
    }

    private func currentLineText(line: Int) -> String {
        let start = sourceLineStartIndex(line: line)
        let end = source[start...].firstIndex(of: "\n") ?? source.endIndex
        return String(source[start..<end])
    }
}

struct Failure: Error, CustomStringConvertible {
    let description: String

    init(_ description: String) {
        self.description = description
    }
}
