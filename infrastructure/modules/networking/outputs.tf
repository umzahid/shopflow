output "vpc_id" {
  description = "VPC id."
  value       = aws_vpc.this.id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet ids (one per AZ)."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet ids (one per AZ)."
  value       = aws_subnet.private[*].id
}

output "nat_gateway_ids" {
  description = "NAT gateway ids."
  value       = aws_nat_gateway.this[*].id
}
