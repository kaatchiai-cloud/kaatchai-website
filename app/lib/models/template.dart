class StoriTemplate {
  final String id;
  final String name;
  final String category;
  final String gradient; // CSS-style gradient string for UI display
  final String size; // e.g., '1280x720', '1080x1920'
  final String? style; // style preset key or null
  final String description;
  final String icon; // emoji

  const StoriTemplate({
    required this.id,
    required this.name,
    required this.category,
    required this.gradient,
    required this.size,
    this.style,
    required this.description,
    required this.icon,
  });

  int get width => int.parse(size.split('x')[0]);
  int get height => int.parse(size.split('x')[1]);
  double get aspectRatio => width / height;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'category': category,
        'gradient': gradient,
        'size': size,
        'style': style,
        'description': description,
        'icon': icon,
      };

  factory StoriTemplate.fromJson(Map<String, dynamic> json) => StoriTemplate(
        id: json['id'] as String,
        name: json['name'] as String,
        category: json['category'] as String,
        gradient: json['gradient'] as String,
        size: json['size'] as String,
        style: json['style'] as String?,
        description: json['description'] as String,
        icon: json['icon'] as String,
      );
}
