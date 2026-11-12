import SwiftUI

/// Каталог и заказы — демо-данные в духе каталога сервера (/api/app): те же продукты и цены, что в веб-приложении picPac.
struct Product: Identifiable, Hashable {
    let id: String
    let name: String
    let short: String
    let price: Double
    let unit: String
    let kind: ProductKind
    let scene: PhotoScene
    let rating: Double
    let reviews: Int
    let tags: [String]
    let specs: [(String, String)]
    let about: String
    let category: String
    var photo: String? = nil
    static func == (a: Product, b: Product) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }
}

enum Catalog {
    static let categories = ["Все", "Фотокниги", "Печать", "Календари", "Холсты", "Магниты"]
    static let products: [Product] = [
        Product(id: "book", name: "Фотокнига Classic", short: "Твёрдая обложка, 20×20", price: 72.90, unit: "/шт", kind: .book, scene: .lake,
                rating: 4.96, reviews: 217, tags: ["Твёрдая обложка", "Раскладка сама"],
                specs: [("square.dashed", "20×20 см"), ("book.pages", "20 стр."), ("rectangle.portrait", "Твёрдая"), ("sparkles", "Ламинация")],
                about: "Ваша история в твёрдой обложке. Раскладку по страницам делаем сами — вы только правите. Плотная бумага, ровный переплёт, перепечатаем бесплатно, если найдёте брак.",
                category: "Фотокниги", photo: "photo-book"),
        Product(id: "prints", name: "Печать 10×15", short: "Фото из телефона на фотобумаге", price: 0.45, unit: "/фото", kind: .prints, scene: .sunset,
                rating: 4.9, reviews: 1284, tags: ["Глянец или мат", "Обрежем сами"],
                specs: [("square.dashed", "10×15 см"), ("drop", "Глянец"), ("scissors", "Без полей"), ("clock", "1 день")],
                about: "Обычные фотографии на настоящей фотобумаге. Приложение само подберёт кадрирование и предупредит, если снимку не хватает резкости.",
                category: "Печать", photo: "photo-prints"),
        Product(id: "calendar", name: "Календарь 2027", short: "12 месяцев — 12 ваших фото", price: 19.50, unit: "/шт", kind: .calendar, scene: .mountains,
                rating: 4.8, reviews: 342, tags: ["Настенный", "Свои даты"],
                specs: [("square.dashed", "А4"), ("calendar", "12 листов"), ("pin", "На стену"), ("gift", "В подарок")],
                about: "Двенадцать ваших кадров на стене на весь год. Отметим дни рождения и праздники, которые вы укажете.",
                category: "Календари", photo: "photo-calendar"),
        Product(id: "canvas", name: "Холст 30×40", short: "Одно фото — на стену", price: 45.00, unit: "/шт", kind: .canvas, scene: .sunset,
                rating: 4.95, reviews: 128, tags: ["Подрамник", "Готов к подвесу"],
                specs: [("square.dashed", "30×40 см"), ("paintbrush", "Холст"), ("square.stack", "Подрамник"), ("clock", "3 дня")],
                about: "Любимый кадр на натуральном холсте с подрамником. Подберём кадрирование, чтобы главное не ушло на край.",
                category: "Холсты", photo: "photo-canvas"),
        Product(id: "magnet", name: "Магнит", short: "Любимый кадр на холодильник", price: 3.40, unit: "/шт", kind: .magnet, scene: .coffee,
                rating: 4.7, reviews: 96, tags: ["Набор от 4 шт.", "Мягкий"],
                specs: [("square.dashed", "8×8 см"), ("circle.grid.2x2", "Набор"), ("drop", "Глянец"), ("clock", "1 день")],
                about: "Маленькие кадры для холодильника и офиса. Хорошо смотрятся набором из 4–9 штук.",
                category: "Магниты", photo: "photo-magnet"),
        Product(id: "wedding", name: "Свадебный альбом", short: "Шаблон «Наш день», 24 стр.", price: 129.00, unit: "/шт", kind: .book, scene: .flower,
                rating: 4.98, reviews: 64, tags: ["Premium", "Льняной переплёт"],
                specs: [("square.dashed", "30×30 см"), ("book.pages", "24 стр."), ("rectangle.portrait", "Лён"), ("sparkles", "Premium")],
                about: "Крупные кадры на разворот, по одному фото на страницу. Подойдёт для 20–40 лучших снимков дня.",
                category: "Фотокниги", photo: "photo-wedding"),
    ]
    static func by(_ id: String) -> Product { products.first { $0.id == id }! }
}

/// Этапы заказа — те же, что видит руководитель в пульте: заказ проходит участки производства.
struct Stage: Identifiable { let id = UUID(); let name: String; let note: String; let time: String?; let state: Int }   // 2 — пройден, 1 — сейчас, 0 — впереди
struct Order: Identifiable {
    let id: String
    let product: Product
    let total: Double
    let stages: [Stage]
}

enum Orders {
    static let demo: [Order] = [
        Order(id: "3127", product: Catalog.by("book"), total: 72.90, stages: [
            Stage(name: "Принят", note: "Оплата при получении", time: "11.11 10:42", state: 2),
            Stage(name: "Проверка макета", note: "Резкость и поля — в порядке", time: "11.11 11:15", state: 2),
            Stage(name: "Печать", note: "Участок печати, смена А", time: "11.11 13:30", state: 2),
            Stage(name: "Сборка", note: "Переплёт и обложка", time: nil, state: 1),
            Stage(name: "Контроль качества", note: "Проверим каждый разворот", time: nil, state: 0),
            Stage(name: "Доставка", note: "Белпочта, 1–2 дня", time: nil, state: 0),
        ]),
        Order(id: "3088", product: Catalog.by("prints"), total: 18.00, stages: [
            Stage(name: "Принят", note: "", time: "08.11", state: 2), Stage(name: "Печать", note: "", time: "08.11", state: 2),
            Stage(name: "Доставка", note: "Вручено", time: "09.11", state: 2),
        ]),
    ]
}
