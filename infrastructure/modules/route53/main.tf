# Public hosted zone for the app domain (PRD Domain 4 lists Route 53 as an
# infrastructure component; a mock domain is explicitly acceptable).
resource "aws_route53_zone" "this" {
  name = var.domain_name
  tags = merge(var.tags, { Name = "${var.name}-zone" })
}

# app.<domain> → CloudFront distribution. ALIAS rather than CNAME: queries to
# alias records are free and the target is an AWS resource with a fixed zone id.
resource "aws_route53_record" "app" {
  zone_id = aws_route53_zone.this.zone_id
  name    = "app.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.app_alias_domain_name
    zone_id                = var.app_alias_zone_id
    evaluate_target_health = false
  }
}

# api.<domain> → backend ingress. The ALB is created at runtime by the ingress
# controller, so its DNS name cannot be referenced at plan time; a documentation
# IP keeps the record in place until the real target is known (then switch to an
# ALIAS on the ALB).
resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.this.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"
  ttl     = 300
  records = [var.api_placeholder_ip]
}
